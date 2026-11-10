import {
    getErrorMessage,
    LightdashError,
    Project,
    WarehouseTypes,
    type ConnectionRoute,
    type DbtSourceBindings,
    type WarehouseConnectionWithCredentials,
} from '@lightdash/common';
import { assertConnectionResponse } from '../agentConnections/responseValidation';
import { getAgentConnectionSelection } from '../credentials';
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
    sourceUuid: string | undefined,
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
        let disableTimestampConversion =
            getDisableTimestampConversionFromProject(
                project.warehouseConnection,
            );
        let settingsSource = 'project settings';
        if (sourceUuid !== undefined && project.connectionRoute === 'multi') {
            try {
                const bindings = await lightdashApi<DbtSourceBindings>({
                    method: 'GET',
                    url: `/api/v1/projects/${projectUuid}/warehouse-connections/dbt-sources/bindings`,
                    body: undefined,
                });
                const warehouseConnectionUuid = bindings.sources.find(
                    (source) => source.projectDbtSourceUuid === sourceUuid,
                )?.warehouseConnectionUuid;
                const boundConnection = bindings.connections.find(
                    (connection) =>
                        connection.warehouseConnectionUuid ===
                        warehouseConnectionUuid,
                );
                if (warehouseConnectionUuid && !boundConnection?.isOriginal) {
                    const connection =
                        await lightdashApi<WarehouseConnectionWithCredentials>({
                            method: 'GET',
                            url: `/api/v1/projects/${projectUuid}/warehouse-connections/${warehouseConnectionUuid}`,
                            body: undefined,
                        });
                    disableTimestampConversion =
                        getDisableTimestampConversionFromProject(
                            connection.warehouseConnection ?? undefined,
                        );
                    settingsSource = `connection "${connection.name}"`;
                }
            } catch (e) {
                if (!(e instanceof LightdashError) || e.statusCode !== 403) {
                    throw e;
                }
                console.error(
                    styles.warning(
                        "Could not read the source's connection settings. Using the project setting for timestamp conversion.",
                    ),
                );
            }
        }
        assertConnectionResponse(
            disableTimestampConversion === undefined ||
                typeof disableTimestampConversion === 'boolean',
        );
        GlobalState.debug(
            `> Using disable-timestamp-conversion=${String(
                disableTimestampConversion ?? false,
            )} from ${settingsSource}`,
        );
        return {
            disableTimestampConversion,
            connectionRoute: project.connectionRoute,
        };
    } catch (e) {
        if (getAgentConnectionSelection() !== null) throw e;
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
        return (
            await getProjectDeploySettings(cliValue, projectUuid, undefined)
        ).disableTimestampConversion;
    } catch {
        return undefined;
    }
};
