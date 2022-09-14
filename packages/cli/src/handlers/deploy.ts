import {
    AuthorizationError,
    friendlyName,
    Project,
    ProjectType,
} from '@lightdash/common';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import { LightdashAnalytics } from '../analytics/analytics';
import { getConfig } from '../config';
import { getDbtContext } from '../dbt/context';
import * as styles from '../styles';
import { compile } from './compile';
import { createProject } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { DbtCompileOptions } from './dbt/compile';

type DeployHandlerOptions = DbtCompileOptions & {
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    create?: boolean;
};

type DeployArgs = DeployHandlerOptions & {
    projectUuid: string;
};
export const deploy = async (options: DeployArgs): Promise<void> => {
    const explores = await compile(options);
    await lightdashApi<undefined>({
        method: 'PUT',
        url: `/api/v1/projects/${options.projectUuid}/explores`,
        body: JSON.stringify(explores),
    });
    LightdashAnalytics.track({
        event: 'deploy.triggered',
        properties: {
            projectId: options.projectUuid,
        },
    });
};

const createNewProject = async (
    options: DeployHandlerOptions,
): Promise<Project> => {
    console.error('');
    const absoluteProjectPath = path.resolve(options.projectDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const dbtName = friendlyName(context.projectName);

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: `Add a project name or press enter to use the default: [${dbtName}] `,
        },
    ]);
    const projectName = answers.name ? answers.name : dbtName;

    console.error('');
    const spinner = ora(`  Creating new project`).start();

    try {
        const project = await createProject({
            ...options,
            name: projectName,
            type: ProjectType.NONE,
        });
        spinner.succeed(`  New project ${styles.bold(projectName)} created\n`);

        return project;
    } catch (e) {
        spinner.fail();
        throw e;
    }
};

export const deployHandler = async (options: DeployHandlerOptions) => {
    const config = await getConfig();
    let projectUuid: string;

    if (options.create) {
        const project = await createNewProject(options);
        projectUuid = project.projectUuid;
    } else {
        if (!(config.context?.project && config.context.serverUrl)) {
            throw new AuthorizationError(
                `No active Lightdash project. Run 'lightdash login --help'`,
            );
        }
        projectUuid = config.context.project;
    }

    await deploy({ ...options, projectUuid });

    console.error(`${styles.bold('Successfully deployed project:')}`);
    console.error('');
    console.error(
        `      ${styles.bold(
            `⚡️ ${config.context?.serverUrl}/projects/${projectUuid}/tables`,
        )}`,
    );
    console.error('');
};
