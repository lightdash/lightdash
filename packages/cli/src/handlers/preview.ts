import * as core from '@actions/core';
import { Project, ProjectType } from '@lightdash/common';
import chokidar from 'chokidar';
import inquirer from 'inquirer';
import path from 'path';
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setPreviewProject, unsetPreviewProject } from '../config';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { compile } from './compile';
import { createProject } from './createProject';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';
import { deploy } from './deploy';

type PreviewHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    name?: string;
    verbose: boolean;
    startOfWeek?: number;
    timezone?: string;
};

type StopPreviewHandlerOptions = {
    name: string;
    verbose: boolean;
};

const deletePreviewProject = async (
    projectUuid: string | undefined,
): Promise<void> => {
    /**
     * projectUuid may be undefined here if a command fails early enough
     * that a project was never created, or we were otherwise unable to
     * retrieve a UUID. We know `undefined` will always fail, so we avoid
     * the round-trip.
     */
    if (typeof projectUuid === 'undefined') {
        GlobalState.debug(
            'no projectUuid available to delete, may not have been ready yet - skipping',
        );

        return;
    }

    await lightdashApi({
        method: 'DELETE',
        url: `/api/v1/org/projects/${projectUuid}`,
        body: undefined,
    });
};

const cleanupProject = async (
    executionId: string,
    projectUuid: string,
): Promise<void> => {
    const teardownSpinner = GlobalState.startSpinner(`  Cleaning up`);

    try {
        await deletePreviewProject(projectUuid);
        await LightdashAnalytics.track({
            event: 'preview.stopped',
            properties: {
                executionId,
                projectId: projectUuid,
            },
        });
        teardownSpinner.succeed(`  Cleaned up`);
    } catch (e) {
        console.error('Error during cleanup:', e);
        teardownSpinner.fail(`  Cleanup failed`);
    }
};

const projectUrl = async (project: Project): Promise<URL> => {
    const config = await getConfig();

    if (config.context?.serverUrl) {
        return new URL(
            `/projects/${project.projectUuid}/tables`,
            config.context.serverUrl,
        );
    }
    throw new Error(
        'Missing server url. Make sure you login before running other commands.',
    );
};

const getPreviewProject = async (name: string) => {
    const projects = await lightdashApi<Project[]>({
        method: 'GET',
        url: `/api/v1/org/projects/`,
        body: undefined,
    });
    return projects.find(
        (project) =>
            project.type === ProjectType.PREVIEW && project.name === name,
    );
};
export const previewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const executionId = uuidv4();
    await checkLightdashVersion();
    let name = options?.name;
    if (name === undefined) {
        name = uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [colors, animals],
        });
    }

    console.error('');
    const spinner = GlobalState.startSpinner(
        `  Setting up preview environment`,
    );

    const previewProject = await getPreviewProject(name);
    if (previewProject) {
        GlobalState.debug(`> Preview with the same name already running`);
        spinner.fail();
        throw new Error('Preview with the same name already running.');
    }

    let project: Project | undefined;
    let hasContentCopy = false;

    const config = await getConfig();
    try {
        const results = await createProject({
            ...options,
            name,
            type: ProjectType.PREVIEW,
            copiedFromProjectUuid: config.context?.project,
        });

        project = results?.project;
        hasContentCopy = Boolean(results?.hasContentCopy);
    } catch (e) {
        GlobalState.debug(`> Unable to create project: ${e}`);
        spinner.fail();
        throw e;
    }

    if (!project) {
        spinner.fail('Cancel preview environment');
        console.error(
            "To create your project, you'll need to manually enter your warehouse connection details.",
        );
        const createProjectUrl =
            config.context?.serverUrl &&
            new URL('/createProject', config.context.serverUrl);
        if (createProjectUrl) {
            console.error(
                `Fill out the project connection form here: ${createProjectUrl}`,
            );
        }
        return;
    }

    await LightdashAnalytics.track({
        event: 'preview.started',
        properties: {
            executionId,
            projectId: project.projectUuid,
        },
    });
    try {
        const explores = await compile(options);
        await deploy(explores, {
            ...options,
            projectUuid: project.projectUuid,
            ignoreErrors: true,
        });

        await setPreviewProject(project.projectUuid, name);

        process.on('SIGINT', async () => {
            await cleanupProject(executionId, project!.projectUuid);

            process.exit(0);
        });

        if (!hasContentCopy) {
            console.error(
                styles.warning(
                    `\n\nDeveloper preview deployed without any copied content!\n`,
                ),
            );
        }

        spinner.succeed(
            `  Developer preview "${name}" ready at: ${await projectUrl(
                project,
            )}\n`,
        );
        await LightdashAnalytics.track({
            event: 'preview.completed',
            properties: {
                executionId,
                projectId: project.projectUuid,
            },
        });

        const absoluteProjectPath = path.resolve(options.projectDir);
        const context = await getDbtContext({
            projectDir: absoluteProjectPath,
        });
        const manifestFilePath = path.join(context.targetDir, 'manifest.json');

        const pressToShutdown = GlobalState.startSpinner(
            `  Press [ENTER] to shutdown preview...`,
        );

        const watcher = chokidar
            .watch(manifestFilePath)
            .on('change', async () => {
                pressToShutdown.stop();

                console.error(
                    `${styles.title(
                        '↻',
                    )}   Detected changes on dbt project. Updating preview`,
                );
                watcher.unwatch(manifestFilePath);
                // Deploying will change manifest.json too, so we need to stop watching the file until it is deployed
                if (project) {
                    await deploy(await compile(options), {
                        ...options,
                        projectUuid: project.projectUuid,
                        ignoreErrors: true,
                    });
                }

                console.error(`${styles.success('✔')}   Preview updated \n`);
                pressToShutdown.start();

                watcher.add(manifestFilePath);
            });

        await inquirer.prompt([
            {
                type: 'input',
                name: 'press-enter',
                prefix: styles.success('✔'),
                message: `  Press [ENTER] to shutdown preview...`,
            },
        ]);
        pressToShutdown.clear();
    } catch (e) {
        spinner.fail('Error creating developer preview');

        await deletePreviewProject(project.projectUuid);
        await unsetPreviewProject();

        await LightdashAnalytics.track({
            event: 'preview.error',
            properties: {
                executionId,
                projectId: project.projectUuid,
                error: `Error creating developer preview ${e}`,
            },
        });
        throw e;
    }

    await cleanupProject(executionId, project.projectUuid);
};

export const startPreviewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const executionId = uuidv4();
    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    const previewProject = await getPreviewProject(projectName);
    if (previewProject) {
        await LightdashAnalytics.track({
            event: 'start_preview.update',
            properties: {
                executionId,
                projectId: previewProject.projectUuid,
                name: options.name,
            },
        });

        // Update
        console.error(`Updating project preview ${projectName}`);
        const explores = await compile(options);
        await deploy(explores, {
            ...options,
            projectUuid: previewProject.projectUuid,
            ignoreErrors: true,
        });
        const url = await projectUrl(previewProject);
        console.error(`Project updated on ${url}`);
        if (process.env.CI === 'true') {
            core.setOutput('url', url.toString());
            core.setOutput('project_uuid', previewProject.projectUuid);
        }
    } else {
        const config = await getConfig();

        // Create
        console.error(`Creating new project preview ${projectName}`);
        const results = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.PREVIEW,
            copiedFromProjectUuid: config.context?.project,
        });

        const project = results?.project;
        const hasContentCopy = Boolean(results?.hasContentCopy);

        if (!project) {
            console.error(
                "To create your project, you'll need to manually enter your warehouse connection details.",
            );
            const createProjectUrl =
                config.context?.serverUrl &&
                new URL('/createProject', config.context.serverUrl);
            if (createProjectUrl) {
                console.error(
                    `Fill out the project connection form here: ${createProjectUrl}`,
                );
            }
            return;
        }

        await setPreviewProject(project.projectUuid, projectName);

        await LightdashAnalytics.track({
            event: 'start_preview.create',
            properties: {
                executionId,
                projectId: project.projectUuid,
                name: options.name,
            },
        });
        const explores = await compile(options);
        await deploy(explores, {
            ...options,
            projectUuid: project.projectUuid,
            ignoreErrors: true,
        });
        const url = await projectUrl(project);

        if (!hasContentCopy) {
            console.error(
                styles.warning(
                    `\n\nDeveloper preview deployed without any copied content!\n`,
                ),
            );
        }

        console.error(`New project created on ${url}`);
        if (process.env.CI === 'true') {
            core.setOutput('url', url.toString());
            core.setOutput('project_uuid', project.projectUuid);
        }
    }
};

export const stopPreviewHandler = async (
    options: StopPreviewHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const executionId = uuidv4();
    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    await unsetPreviewProject();

    const previewProject = await getPreviewProject(projectName);
    if (previewProject) {
        await LightdashAnalytics.track({
            event: 'stop_preview.delete',
            properties: {
                executionId,
                projectId: previewProject.projectUuid,
                name: options.name,
            },
        });

        await deletePreviewProject(previewProject.projectUuid);
        console.error(
            `Successfully deleted preview project named ${projectName}`,
        );
    } else {
        await LightdashAnalytics.track({
            event: 'stop_preview.missing',
            properties: {
                name: options.name,
            },
        });
        console.error(
            styles.error(
                `Could not find preview project with name ${projectName}`,
            ),
        );
        process.exit(1);
    }
};
