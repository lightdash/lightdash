import {
    getErrorMessage,
    Project,
    WarehouseTypes,
    type ConnectionRoute,
} from '@lightdash/common';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

export const getDisableTimestampConversionFromProject = (
    warehouseConnection: Project['warehouseConnection'],
): boolean | undefined =>
    warehouseConnection?.type === WarehouseTypes.SNOWFLAKE
        ? warehouseConnection.disableTimestampConversion
        : undefined;

export const getProjectDeploySettings = async (
    cliValue: boolean | undefined,
    projectUuid: string,
): Promise<{
    disableTimestampConversion: boolean | undefined;
    connectionRoute: ConnectionRoute | undefined;
}> => {
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
        return {
            disableTimestampConversion,
            connectionRoute: project.connectionRoute,
        };
    } catch (e) {
        GlobalState.debug(
            `> Could not fetch project settings for timestamp conversion: ${getErrorMessage(
                e,
            )}`,
        );
        throw new Error(
            `Could not read project settings for deploy: ${getErrorMessage(e)}`,
            { cause: e },
        );
    }
};

export const getProjectDisableTimestampConversion = async (
    cliValue: boolean | undefined,
    projectUuid: string,
): Promise<boolean | undefined> => {
    try {
        return (await getProjectDeploySettings(cliValue, projectUuid))
            .disableTimestampConversion;
    } catch {
        return undefined;
    }
};
