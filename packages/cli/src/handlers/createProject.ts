import {
    CreateProject,
    DbtProjectType,
    Project,
    ProjectType,
} from '@lightdash/common';
import inquirer from 'inquirer';
import path from 'path';
import { getConfig, setAnswer } from '../config';
import { getDbtContext } from '../dbt/context';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';

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

type CreateProjectHandlerOptions = {
    name: string;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profile: string | undefined;
    type: ProjectType;
};
export const createProject = async (
    options: CreateProjectHandlerOptions,
): Promise<Project | undefined> => {
    const absoluteProjectPath = path.resolve(options.projectDir);
    const absoluteProfilesPath = path.resolve(options.profilesDir);
    const context = await getDbtContext({ projectDir: absoluteProjectPath });
    const profileName = options.profile || context.profileName;
    const { target, name: targetName } = await loadDbtTarget({
        profilesDir: absoluteProfilesPath,
        profileName,
        targetName: options.target,
    });
    const canStoreWarehouseCredentials =
        await askPermissionToStoreWarehouseCredentials();
    if (!canStoreWarehouseCredentials) {
        return undefined;
    }
    const credentials = await warehouseCredentialsFromDbtTarget(target);
    const project: CreateProject = {
        name: options.name,
        type: options.type,
        warehouseConnection: credentials,
        dbtConnection: {
            type: DbtProjectType.DBT,
            target: targetName,
        },
    };
    const createdProject = await lightdashApi<Project>({
        method: 'POST',
        url: `/api/v1/org/projects`,
        body: JSON.stringify(project),
    });
    return createdProject;
};
