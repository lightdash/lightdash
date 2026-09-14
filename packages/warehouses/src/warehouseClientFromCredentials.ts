import {
    assertUnreachable,
    CreateWarehouseCredentials,
    UnexpectedServerError,
    WarehouseTypes,
} from '@lightdash/common';
import { WarehouseClient } from './types';
import { AthenaWarehouseClient } from './warehouseClients/AthenaWarehouseClient';
import { BigqueryWarehouseClient } from './warehouseClients/BigqueryWarehouseClient';
import {
    ClickhouseWarehouseClient,
    type ClickhouseWarehouseClientOptions,
} from './warehouseClients/ClickhouseWarehouseClient';
import { DatabricksWarehouseClient } from './warehouseClients/DatabricksWarehouseClient';
import {
    DuckdbWarehouseClient,
    type DuckdbWarehouseClientOptions,
} from './warehouseClients/DuckdbWarehouseClient';
import { PostgresWarehouseClient } from './warehouseClients/PostgresWarehouseClient';
import { RedshiftWarehouseClient } from './warehouseClients/RedshiftWarehouseClient';
import { SnowflakeWarehouseClient } from './warehouseClients/SnowflakeWarehouseClient';
import { TrinoWarehouseClient } from './warehouseClients/TrinoWarehouseClient';

export type WarehouseClientOptions = DuckdbWarehouseClientOptions &
    ClickhouseWarehouseClientOptions;

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
    options?: WarehouseClientOptions,
): WarehouseClient => {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return new SnowflakeWarehouseClient(credentials);
        case WarehouseTypes.POSTGRES:
            return new PostgresWarehouseClient(credentials);
        case WarehouseTypes.REDSHIFT:
            return new RedshiftWarehouseClient(credentials);
        case WarehouseTypes.BIGQUERY:
            return new BigqueryWarehouseClient(credentials);
        case WarehouseTypes.DATABRICKS:
            return new DatabricksWarehouseClient(credentials);
        case WarehouseTypes.TRINO:
            return new TrinoWarehouseClient(credentials);
        case WarehouseTypes.CLICKHOUSE:
            return new ClickhouseWarehouseClient(credentials, options);
        case WarehouseTypes.ATHENA:
            return new AthenaWarehouseClient(credentials);
        case WarehouseTypes.DUCKDB:
            return new DuckdbWarehouseClient(credentials, options);
        default:
            return assertUnreachable(
                credentials,
                new UnexpectedServerError(
                    'Warehouse credentials type were not recognised',
                ),
            );
    }
};
