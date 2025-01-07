import {
    assertUnreachable,
    CreateWarehouseCredentials,
    isWeekDay,
    SupportedDbtAdapter,
    WarehouseTypes,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import path from 'path';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../../dbt/profile';
import GlobalState from '../../globalState';

function getMockCredentials(
    dbtAdaptorType: SupportedDbtAdapter,
): CreateWarehouseCredentials {
    let credentials: CreateWarehouseCredentials;
    switch (dbtAdaptorType) {
        case SupportedDbtAdapter.BIGQUERY:
            credentials = {
                type: WarehouseTypes.BIGQUERY,
                project: '',
                dataset: '',
                timeoutSeconds: undefined,
                priority: undefined,
                keyfileContents: {},
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
            };
            break;
        case SupportedDbtAdapter.POSTGRES:
            credentials = {
                type: WarehouseTypes.POSTGRES,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
            };
            break;
        case SupportedDbtAdapter.REDSHIFT:
            credentials = {
                type: WarehouseTypes.REDSHIFT,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
            };
            break;
        case SupportedDbtAdapter.SNOWFLAKE:
            credentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: '',
                user: '',
                password: '',
                warehouse: '',
                database: '',
                schema: '',
                role: '',
            };
            break;

        case SupportedDbtAdapter.DATABRICKS:
            credentials = {
                type: WarehouseTypes.DATABRICKS,
                catalog: '',
                database: '',
                serverHostName: '',
                httpPath: '',
                personalAccessToken: '',
            };
            break;
        case SupportedDbtAdapter.TRINO:
            credentials = {
                type: WarehouseTypes.TRINO,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
                http_scheme: '',
            };
            break;
        default:
            assertUnreachable(
                dbtAdaptorType,
                `Unsupported dbt adaptor type ${dbtAdaptorType}`,
            );
    }
    return credentials;
}

type GetWarehouseClientOptions = {
    isDbtCloudCLI: boolean;
    dbtAdaptorType: SupportedDbtAdapter;
    profilesDir: string;
    profile: string;
    target?: string;
    startOfWeek?: number;
};

export default async function getWarehouseClient(
    options: GetWarehouseClientOptions,
) {
    let warehouseClient;
    if (options.isDbtCloudCLI) {
        GlobalState.debug(`> Using ${options.dbtAdaptorType} client mock`);
        warehouseClient = warehouseClientFromCredentials({
            ...getMockCredentials(options.dbtAdaptorType),
            startOfWeek: isWeekDay(options.startOfWeek)
                ? options.startOfWeek
                : undefined,
        });
        // Overwrite methods that need to connect to the warehouse
        warehouseClient.getCatalog = async () => {
            GlobalState.debug(
                `> WarehouseClient.getCatalog() is not supported with dbt Cloud CLI. An empty catalog will be used.`,
            );
            return {};
        };
        warehouseClient.streamQuery = async (_query, streamCallback) => {
            GlobalState.debug(
                `> WarehouseClient.streamQuery() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return streamCallback({ fields: {}, rows: [] });
        };
        warehouseClient.runQuery = async () => {
            GlobalState.debug(
                `> WarehouseClient.runQuery() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return { fields: {}, rows: [] };
        };
        warehouseClient.test = async () => {
            GlobalState.debug(
                `> WarehouseClient.test() is not supported with dbt Cloud CLI. No test will be run.`,
            );
        };
        warehouseClient.getAllTables = async () => {
            GlobalState.debug(
                `> WarehouseClient.getAllTables() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return [];
        };
        warehouseClient.getFields = async () => {
            GlobalState.debug(
                `> WarehouseClient.getFields() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return { fields: {} };
        };
    } else {
        const absoluteProfilesPath = path.resolve(options.profilesDir);
        GlobalState.debug(
            `> Using profiles dir ${absoluteProfilesPath} and profile ${options.profile}`,
        );
        const { target } = await loadDbtTarget({
            profilesDir: absoluteProfilesPath,
            profileName: options.profile,
            targetName: options.target,
        });
        GlobalState.debug(`> Using target ${target}`);
        const credentials = await warehouseCredentialsFromDbtTarget(target);
        warehouseClient = warehouseClientFromCredentials({
            ...credentials,
            startOfWeek: isWeekDay(options.startOfWeek)
                ? options.startOfWeek
                : undefined,
        });
    }
    return warehouseClient;
}
