import { Project, ProjectType } from '@lightdash/common';
import chokidar from 'chokidar';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from 'unique-names-generator';
import { URL } from 'url';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import * as styles from '../styles';
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
};

type StopPreviewHandlerOptions = {
    name: string;
    verbose: boolean;
};

const projectUrl = async (project: Project) => {
    const config = await getConfig();

    return (
        config.context?.serverUrl &&
        new URL(
            `/projects/${project.projectUuid}/tables`,
            config.context.serverUrl,
        )
    );
};

const getPreviewProject = async (name: string, verbose?: boolean) => {
    const projects = await lightdashApi<Project[]>({
        method: 'GET',
        url: `/api/v1/org/projects/`,
        body: undefined,
        verbose,
    });
    return projects.find(
        (project) =>
            project.type === ProjectType.PREVIEW && project.name === name,
    );
};
export const previewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    await checkLightdashVersion();
    const name = uniqueNamesGenerator({
        length: 2,
        separator: ' ',
        dictionaries: [adjectives, animals],
    });
    console.error('');
    const spinner = ora(`  Setting up preview environment`).start();
    GlobalState.setActiveSpinner(spinner);
    let project: Project | undefined;

    try {
        project = await createProject({
            ...options,
            name,
            type: ProjectType.PREVIEW,
        });
    } catch (e) {
        if (options.verbose) console.error(`> Unable to create project: ${e}`);
        spinner.fail();
        throw e;
    }

    if (!project) {
        spinner.fail('Cancel preview environment');
        console.error(
            "To create your project, you'll need to manually enter your warehouse connection details.",
        );
        const config = await getConfig();
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

    LightdashAnalytics.track({
        event: 'preview.started',
        properties: {
            projectId: project.projectUuid,
        },
    });
    try {
        await deploy({ ...options, projectUuid: project.projectUuid });
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

        const pressToContinue = ora(`  Press [ENTER] to continue...`).start();

        const watcher = chokidar
            .watch(manifestFilePath)
            .on('change', async () => {
                pressToContinue.stop();

                console.error(
                    `${styles.title(
                        '↻',
                    )}   Detected changes on DBT project. Updating preview`,
                );
                watcher.unwatch(manifestFilePath);
                // Deploying will change manifest.json too, so we need to stop watching the file until it is deployed
                if (project) {
                    await deploy({
                        ...options,
                        projectUuid: project.projectUuid,
                    });
                }

                console.error(`${styles.success('✔')}   Preview updated \n`);
                pressToContinue.start();

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
        pressToContinue.clear();
    } catch (e) {
        spinner.fail('Error creating developer preview');
        await lightdashApi({
            method: 'DELETE',
            url: `/api/v1/org/projects/${project.projectUuid}`,
            body: undefined,
        });
        LightdashAnalytics.track({
            event: 'preview.error',
            properties: {
                projectId: project.projectUuid,
                error: `Error creating developer preview ${e}`,
            },
        });
        throw e;
    }
    const teardownSpinner = ora(`  Cleaning up`).start();
    GlobalState.setActiveSpinner(spinner);
    await lightdashApi({
        method: 'DELETE',
        url: `/api/v1/org/projects/${project.projectUuid}`,
        body: undefined,
    });
    LightdashAnalytics.track({
        event: 'preview.completed',
        properties: {
            projectId: project.projectUuid,
        },
    });
    teardownSpinner.succeed(`  Cleaned up`);
};

export const startPreviewHandler = async (
    options: PreviewHandlerOptions,
): Promise<void> => {
    await checkLightdashVersion();

    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    const previewProject = await getPreviewProject(
        projectName,
        options.verbose,
    );
    if (previewProject) {
        LightdashAnalytics.track({
            event: 'start_preview.update',
            properties: {
                projectId: previewProject.projectUuid,
                name: options.name,
            },
        });

        // Update
        console.error(`Updating project preview ${projectName}`);
        await deploy({ ...options, projectUuid: previewProject.projectUuid });
        console.error(`Project updated on ${await projectUrl(previewProject)}`);
    } else {
        // Create
        console.error(`Creating new project preview ${projectName}`);
        const project = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.PREVIEW,
        });

        if (!project) {
            console.error(
                "To create your project, you'll need to manually enter your warehouse connection details.",
            );
            const config = await getConfig();
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
        LightdashAnalytics.track({
            event: 'start_preview.create',
            properties: {
                projectId: project.projectUuid,
                name: options.name,
            },
        });
        await deploy({ ...options, projectUuid: project.projectUuid });
        console.error(`New project created on ${await projectUrl(project)}`);
    }
};

export const stopPreviewHandler = async (
    options: StopPreviewHandlerOptions,
): Promise<void> => {
    await checkLightdashVersion();

    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    const previewProject = await getPreviewProject(
        projectName,
        options.verbose,
    );
    if (previewProject) {
        LightdashAnalytics.track({
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
        LightdashAnalytics.track({
            event: 'stop_preview.missing',
            properties: {
                name: options.name,
            },
        });

        console.error(
            `Could not find preview project with name ${projectName}`,
        );
    }
};
