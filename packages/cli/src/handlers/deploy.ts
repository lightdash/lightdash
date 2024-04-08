import {
    AuthorizationError,
    Explore,
    ExploreError,
    friendlyName,
    isExploreError,
    Project,
    ProjectType,
} from '@lightdash/common';
import inquirer from 'inquirer';
import path from 'path';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig, setProject } from '../config';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { compile } from './compile';
import { createProject } from './createProject';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';

type DeployHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    create?: boolean | string;
    verbose: boolean;
    ignoreErrors: boolean;
    startOfWeek?: number;
    timezone?: string;
};

type DeployArgs = DeployHandlerOptions & {
    projectUuid: string;
};

export const deploy = async (
    explores: (Explore | ExploreError)[],
    options: DeployArgs,
): Promise<void> => {
    const errors = explores.filter((e) => isExploreError(e)).length;
    if (errors > 0) {
        if (options.ignoreErrors) {
            console.error(
                styles.warning(`\nDeploying project with ${errors} errors\n`),
            );
        } else {
            console.error(
                styles.error(
                    `Can't deploy with errors. If you still want to deploy, add ${styles.bold(
                        '--ignore-errors',
                    )} flag`,
                ),
            );
            process.exit(1);
        }
    }

    await lightdashApi<null>({
        method: 'PUT',
        url: `/api/v1/projects/${options.projectUuid}/explores`,
        body: JSON.stringify(explores),
    });
    await LightdashAnalytics.track({
        event: 'deploy.triggered',
        properties: {
            projectId: options.projectUuid,
        },
    });
};

const createNewProject = async (
    executionId: string,
    options: DeployHandlerOptions,
): Promise<Project | undefined> => {
    console.error('');
    const absoluteProjectPath = path.resolve(options.projectDir);
    const context = await getDbtContext({
        projectDir: absoluteProjectPath,
    });
    const dbtName = friendlyName(context.projectName);

    // default project name
    const defaultProjectName = dbtName;
    let projectName = defaultProjectName;

    // If interactive and no name provided, prompt for project name
    if (options.create === true && process.env.CI !== 'true') {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: `Add a project name or press enter to use the default: [${defaultProjectName}] `,
            },
        ]);
        projectName = answers.name ? answers.name : defaultProjectName;
    }
    // If explicit name provided, use it
    if (typeof options.create === 'string') {
        projectName = options.create;
    }

    // Create the project
    console.error('');
    const spinner = GlobalState.startSpinner(
        `  Creating new project ${styles.bold(projectName)}`,
    );
    await LightdashAnalytics.track({
        event: 'create.started',
        properties: {
            executionId,
            projectName,
            isDefaultName: dbtName === projectName,
        },
    });
    try {
        const results = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.DEFAULT,
        });

        const project = results?.project;

        if (!project) {
            spinner.fail('Cancel preview environment');
            return undefined;
        }
        spinner.succeed(`  New project ${styles.bold(projectName)} created\n`);

        await LightdashAnalytics.track({
            event: 'create.completed',
            properties: {
                executionId,
                projectId: project.projectUuid,
                projectName,
            },
        });

        return project;
    } catch (e) {
        await LightdashAnalytics.track({
            event: 'create.error',
            properties: {
                executionId,
                error: `Error creating developer preview ${e}`,
            },
        });

        spinner.fail();
        throw e;
    }
};

export const deployHandler = async (options: DeployHandlerOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();
    const executionId = uuidv4();
    const explores = await compile(options);

    const config = await getConfig();
    let projectUuid: string;

    if (options.create !== undefined) {
        const project = await createNewProject(executionId, options);
        if (!project) {
            console.error(
                "To preview your project, you'll need to manually enter your warehouse connection details.",
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
        projectUuid = project.projectUuid;
        await setProject(projectUuid, project.name);
    } else {
        if (!(config.context?.project && config.context.serverUrl)) {
            throw new AuthorizationError(
                `No active Lightdash project. Run 'lightdash login --help'`,
            );
        }
        projectUuid = config.context.project;
    }

    await deploy(explores, { ...options, projectUuid });

    const displayUrl = options.create
        ? `${config.context?.serverUrl}/createProject/cli?projectUuid=${projectUuid}`
        : `${config.context?.serverUrl}/projects/${projectUuid}/home`;

    console.error(`${styles.bold('Successfully deployed project:')}`);
    console.error('');
    console.error(`      ${styles.bold(`⚡️ ${displayUrl}`)}`);
    console.error('');
};
