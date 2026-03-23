import {
    AuthorizationError,
    type ApiJobStartedResults,
    type UpdateProject,
} from '@lightdash/common';
import inquirer from 'inquirer';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { loadWarehouseCredentialsFromProfiles } from './createProject';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';
import { getFinalJobState, getProject } from './dbt/refresh';

type SetWarehouseHandlerOptions = {
    projectDir: string;
    profilesDir: string;
    target?: string;
    profile?: string;
    targetPath?: string;
    project?: string;
    startOfWeek?: number;
    assumeYes: boolean;
    verbose: boolean;
};

const resolveProjectUuid = async (projectOption?: string): Promise<string> => {
    if (projectOption) {
        return projectOption;
    }
    const config = await getConfig();
    if (!config.context?.project) {
        throw new AuthorizationError(
            `No project selected. Run 'lightdash config set-project' first or pass '--project <uuid>'.`,
        );
    }
    return config.context.project;
};

export const setWarehouseHandler = async (
    options: SetWarehouseHandlerOptions,
) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    const projectUuid = await resolveProjectUuid(options.project);

    // Load credentials from profiles.yml
    const loaded = await loadWarehouseCredentialsFromProfiles({
        projectDir: options.projectDir,
        profilesDir: options.profilesDir,
        target: options.target,
        profile: options.profile,
        startOfWeek: options.startOfWeek,
        assumeYes: options.assumeYes,
        targetPath: options.targetPath,
    });
    if (!loaded) {
        console.error(
            styles.warning(
                'User declined to store warehouse credentials. Use --assume-yes to bypass.',
            ),
        );
        return;
    }
    const { credentials } = loaded;

    // Fetch existing project to preserve its settings
    const existingProject = await getProject(projectUuid);

    // Confirmation prompt
    if (!options.assumeYes && !GlobalState.isNonInteractive()) {
        const spinner = GlobalState.getActiveSpinner();
        spinner?.stop();
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'isConfirm',
                message: `This will update the warehouse connection on project '${existingProject.name}' to ${credentials.type} and trigger a recompile. Continue?`,
                default: false,
            },
        ]);
        if (!answers.isConfirm) {
            console.error(styles.warning('Aborted.'));
            return;
        }
        spinner?.start();
    }

    const spinner = GlobalState.startSpinner(
        '  Updating warehouse connection...',
    );

    try {
        // Build UpdateProject body — preserve existing fields, override warehouseConnection.
        // Note: dbtConnection from GET response may have stripped secrets, but the backend's
        // mergeMissingProjectConfigSecrets fills them back in from the saved project before persisting.
        const updateBody: UpdateProject = {
            name: existingProject.name,
            dbtConnection: existingProject.dbtConnection,
            dbtVersion: existingProject.dbtVersion,
            warehouseConnection: credentials,
        };

        // PATCH project — triggers adaptor test + recompile
        const result = await lightdashApi<ApiJobStartedResults>({
            method: 'PATCH',
            url: `/api/v1/projects/${projectUuid}`,
            body: JSON.stringify(updateBody),
        });

        // Poll until job completes (custom spinner prefix)
        await getFinalJobState(result.jobUuid, 'Updating warehouse connection');

        spinner.stop();
    } catch (e) {
        spinner.fail();
        throw e;
    }

    const config = await getConfig();
    const displayUrl = `${config.context?.serverUrl}/projects/${projectUuid}/home`;

    console.error(
        `${styles.bold('Successfully updated warehouse connection:')}`,
    );
    console.error('');
    console.error(`      ${styles.bold(`⚡️ ${displayUrl}`)}`);
    console.error('');
};
