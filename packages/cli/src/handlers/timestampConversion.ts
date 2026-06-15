import { getErrorMessage, Project, WarehouseTypes } from '@lightdash/common';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

export const getDisableTimestampConversionFromProject = (
    warehouseConnection: Project['warehouseConnection'],
): boolean | undefined =>
    warehouseConnection?.type === WarehouseTypes.SNOWFLAKE
        ? warehouseConnection.disableTimestampConversion
        : undefined;

/**
 * Reads `disableTimestampConversion` from an existing project's settings.
 * The CLI flag is ignored for commands targeting an existing project — the
 * project settings are the source of truth.
 */
export const getProjectDisableTimestampConversion = async (
    cliValue: boolean | undefined,
    projectUuid: string,
): Promise<boolean | undefined> => {
    if (cliValue !== undefined) {
        console.error(
            styles.warning(
                'Ignoring --disable-timestamp-conversion: this command reads the setting from the project settings.',
            ),
        );
    }
    try {
        const project = await lightdashApi<Project>({
            method: 'GET',
            url: `/api/v1/projects/${projectUuid}`,
            body: undefined,
        });
        const disableTimestampConversion =
            getDisableTimestampConversionFromProject(
                project.warehouseConnection,
            );
        GlobalState.debug(
            `> Using disable-timestamp-conversion=${String(
                disableTimestampConversion ?? false,
            )} from project settings`,
        );
        return disableTimestampConversion;
    } catch (e) {
        GlobalState.debug(
            `> Could not fetch project settings for timestamp conversion: ${getErrorMessage(
                e,
            )}`,
        );
        return undefined;
    }
};
