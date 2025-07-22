import {
    CreateProjectOptionalCredentials,
    CreateProjectTableConfiguration,
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    type ApiCreateProjectResults,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import inquirer from 'inquirer';
import path from 'path';
import { getConfig, setAnswer } from '../config';
import { getDbtContext } from '../dbt/context';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';
import getDbtProfileTargetName from './dbt/getDbtProfileTargetName';
import { getDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient from './dbt/getWarehouseClient';

const askToRememberAnswer = async (): Promise<void> => {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'isConfirm',
            message: 'Do you want to save this answer for next time?',
        },
    ]);
    if (answers.isConfirm) {
        await setAnswer({
            permissionToStoreWarehouseCredentials: true,
        });
    }
};

const askPermissionToStoreWarehouseCredentials = async (): Promise<boolean> => {
    if (process.env.CI === 'true') {
        return true;
    }

    const config = await getConfig();
    const savedAnswer = config.answers?.permissionToStoreWarehouseCredentials;
    if (!savedAnswer) {
        const spinner = GlobalState.getActiveSpinner();
        if (spinner) {
            spinner.stop();
        }
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message:
                    'Do you confirm Lightdash can store your warehouse credentials so you can run queries in Lightdash?',
            },
        ]);
        if (answers.isConfirm) {
            await askToRememberAnswer();
        }
        if (spinner) {
            spinner.start();
        }
        return answers.isConfirm;
    }
    return savedAnswer;
};

type CreateProjectOptions = {
    name: string;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    type: ProjectType;
    startOfWeek?: number;
    upstreamProjectUuid?: string;
    tableConfiguration?: CreateProjectTableConfiguration;
    copyContent?: boolean;
    warehouseCredentials?: boolean;
};

export const createProject = async (
    options: CreateProjectOptions,
): Promise<ApiCreateProjectResults | undefined> => {
    const dbtVersion = await getDbtVersion();

    const absoluteProjectPath = path.resolve(options.projectDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });

    let targetName: string | undefined;
    let credentials: CreateWarehouseCredentials | undefined;

    if (options.warehouseCredentials === false) {
        GlobalState.debug('> Creating project without warehouse credentials');
    } else {
        GlobalState.debug(
            `> Using profiles dir ${options.profilesDir} and profile ${
                options.profile || context.profileName
            }`,
        );
        targetName = await getDbtProfileTargetName({
            isDbtCloudCLI: dbtVersion.isDbtCloudCLI,
            profilesDir: options.profilesDir,
            profile: options.profile || context.profileName,
            target: options.target,
        });
        GlobalState.debug(`> Using target name ${targetName}`);
        const canStoreWarehouseCredentials =
            await askPermissionToStoreWarehouseCredentials();
        if (!canStoreWarehouseCredentials) {
            GlobalState.debug(
                '> User declined to store warehouse credentials use --no-warehouse-credentials to create a project without warehouse credentials',
            );
            return undefined;
        }
        const result = await getWarehouseClient({
            isDbtCloudCLI: dbtVersion.isDbtCloudCLI,
            profilesDir: options.profilesDir,
            profile: options.profile || context.profileName,
            target: options.target,
            startOfWeek: options.startOfWeek,
        });
        credentials = result.credentials;
    }

    if (
        credentials?.type === WarehouseTypes.BIGQUERY &&
        credentials.keyfileContents.project_id &&
        credentials.keyfileContents.project_id !== credentials.project
    ) {
        const spinner = GlobalState.getActiveSpinner();
        spinner?.stop();
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message: `${styles.title(
                    'Warning',
                )}: Your project on your credentials file ${styles.title(
                    credentials.keyfileContents.project_id,
                )} does not match your project on your profiles.yml ${styles.title(
                    credentials.project,
                )}, this might cause permission issues when accessing data on the warehouse. Are you sure you want to continue?`,
            },
        ]);

        if (!answers.isConfirm) {
            process.exit(1);
        }
        spinner?.start();
    }

    const project: CreateProjectOptionalCredentials = {
        name: options.name,
        type: options.type,
        warehouseConnection: credentials,
        copyWarehouseConnectionFromUpstreamProject: dbtVersion.isDbtCloudCLI,
        dbtConnection: {
            type: DbtProjectType.NONE,
            target: targetName,
        },
        upstreamProjectUuid: options.upstreamProjectUuid,
        dbtVersion: dbtVersion.versionOption,
        tableConfiguration: options.tableConfiguration,
        copyContent: options.copyContent,
    };

    return lightdashApi<ApiCreateProjectResults>({
        method: 'POST',
        url: `/api/v1/org/projects`,
        body: JSON.stringify(project),
    });
};
