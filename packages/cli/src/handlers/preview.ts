import * as core from '@actions/core';
import { Project, ProjectType } from '@lightdash/common';
import chokidar from 'chokidar';
import inquirer from 'inquirer';
import path from 'path';
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from 'unique-names-generator';
import { URL } from 'url';
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
};

type StopPreviewHandlerOptions = {
    name: string;
    verbose: boolean;
};

const cleanupProject = async (projectUuid: string): Promise<void> => {
    const teardownSpinner = GlobalState.startSpinner(`  Cleaning up`);

    try {
        await lightdashApi({
            method: 'DELETE',
            url: `/api/v1/org/projects/${projectUuid}`,
            body: undefined,
        });
        await LightdashAnalytics.track({
            event: 'preview.completed',
            properties: {
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
    await checkLightdashVersion();
    let name = options?.name;
    if (name === undefined) {
        name = uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [adjectives, animals],
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

    const config = await getConfig();
    try {
        project = await createProject({
            ...options,
            name,
            type: ProjectType.PREVIEW,
            copiedFromProjectUuid: config.context?.project,
        });
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

        setPreviewProject(project.projectUuid, name);

        process.on('SIGINT', async () => {
            await cleanupProject(project!.projectUuid);

            process.exit(0);
        });

        spinner.succeed(
            `  Developer preview "${name}" ready at: ${await projectUrl(
                project,
            )}\n`,
        );

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
        await lightdashApi({
            method: 'DELETE',
            url: `/api/v1/org/projects/${project.projectUuid}`,
            body: undefined,
        });

        unsetPreviewProject();

        await LightdashAnalytics.track({
            event: 'preview.error',
            properties: {
                projectId: project.projectUuid,
                error: `Error creating developer preview ${e}`,
            },
        });
        throw e;
    }

    await cleanupProject(project.projectUuid);
};

export const startPreviewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

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
        const project = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.PREVIEW,
            copiedFromProjectUuid: config.context?.project,
        });

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

        setPreviewProject(project.projectUuid, projectName);

        await LightdashAnalytics.track({
            event: 'start_preview.create',
            properties: {
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

    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    unsetPreviewProject();

    const previewProject = await getPreviewProject(projectName);
    if (previewProject) {
        await LightdashAnalytics.track({
            event: 'stop_preview.delete',
            properties: {
                projectId: previewProject.projectUuid,
                name: options.name,
            },
        });

        await lightdashApi({
            method: 'DELETE',
            url: `/api/v1/org/projects/${previewProject.projectUuid}`,
            body: undefined,
        });
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
