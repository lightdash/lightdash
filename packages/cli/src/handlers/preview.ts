import { Project, ProjectType } from '@lightdash/common';
import chokidar from 'chokidar';
import inquirer from 'inquirer';
// import PressToContinuePrompt from 'inquirer-press-to-continue';
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
import * as styles from '../styles';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';
import { deploy } from './deploy';

// inquirer.registerPrompt('press-to-continue', PressToContinuePrompt);

type PreviewHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    name?: string;
};

type StopPreviewHandlerOptions = {
    name: string;
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
    const name = uniqueNamesGenerator({
        length: 2,
        separator: ' ',
        dictionaries: [adjectives, animals],
    });
    console.error('');
    const spinner = ora(`  Setting up preview environment`).start();
    let project: Project;

    try {
        project = await createProject({
            ...options,
            name,
            type: ProjectType.PREVIEW,
        });
    } catch (e) {
        spinner.fail();
        throw e;
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
                // process.stdout.write('\r\x1b[K'); // removes last output log (inquirer.prompt)
                console.error(
                    `${styles.title(
                        '↻',
                    )}   Detected changes on DBT project. Updating preview`,
                );
                watcher.unwatch(manifestFilePath);
                // Deploying will change manifest.json too, so we need to stop watching the file until it is deployed
                await deploy({ ...options, projectUuid: project.projectUuid });
                // process.stdout.write('\r\x1b[K'); // removes last output log (inquirer.prompt)

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

        const a: any = { x: { y: 1 } };
        console.error('a', a?.x.y);
        const fruits = new Map([
            ['apples', 500],
            ['bananas', 300],
            ['oranges', 200],
        ]);
        console.error('fruits', fruits);
        class Car {
            n: any;

            year: any;

            constructor(n: any, year: any) {
                this.n = n;
                this.year = year;
            }
        }
        const myCar1 = new Car('Ford', 2014);
        console.error('mycar', myCar1);
        Math.trunc(3);
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
    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    const previewProject = await getPreviewProject(projectName);
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
    if (!options.name) {
        console.error(styles.error(`--name argument is required`));
        return;
    }

    const projectName = options.name;

    const previewProject = await getPreviewProject(projectName);
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
