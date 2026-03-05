import {
    isSupportedDbtAdapterType,
    SupportedDbtAdapter,
} from '@lightdash/common';
import { AthenaSqlBuilder } from './warehouseClients/AthenaWarehouseClient';
import { BigquerySqlBuilder } from './warehouseClients/BigqueryWarehouseClient';
import { ClickhouseSqlBuilder } from './warehouseClients/ClickhouseWarehouseClient';
import { DatabricksSqlBuilder } from './warehouseClients/DatabricksWarehouseClient';
import { DuckdbSqlBuilder } from './warehouseClients/DuckdbWarehouseClient';
import { PostgresSqlBuilder } from './warehouseClients/PostgresWarehouseClient';
import { RedshiftSqlBuilder } from './warehouseClients/RedshiftWarehouseClient';
import { SnowflakeSqlBuilder } from './warehouseClients/SnowflakeWarehouseClient';
import { TrinoSqlBuilder } from './warehouseClients/TrinoWarehouseClient';
import WarehouseBaseSqlBuilder from './warehouseClients/WarehouseBaseSqlBuilder';

export const warehouseSqlBuilderFromType = (
    adapterType: string | SupportedDbtAdapter,
    ...args: ConstructorParameters<typeof WarehouseBaseSqlBuilder>
) => {
    if (!isSupportedDbtAdapterType(adapterType)) {
        throw new Error(
            `Invalid adapter type: ${adapterType}. Must be one of: ${Object.values(
                SupportedDbtAdapter,
            ).join(', ')}`,
        );
    }

    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            return new BigquerySqlBuilder(...args);
        case SupportedDbtAdapter.CLICKHOUSE:
            return new ClickhouseSqlBuilder(...args);
        case SupportedDbtAdapter.DATABRICKS:
            return new DatabricksSqlBuilder(...args);
        case SupportedDbtAdapter.DUCKDB:
            return new DuckdbSqlBuilder(...args);
        case SupportedDbtAdapter.POSTGRES:
            return new PostgresSqlBuilder(...args);
        case SupportedDbtAdapter.REDSHIFT:
            return new RedshiftSqlBuilder(...args);
        case SupportedDbtAdapter.SNOWFLAKE:
            return new SnowflakeSqlBuilder(...args);
        case SupportedDbtAdapter.TRINO:
            return new TrinoSqlBuilder(...args);
        case SupportedDbtAdapter.ATHENA:
            return new AthenaSqlBuilder(...args);
        default:
            const never: never = adapterType;
            throw new Error(`Unsupported adapter type: ${adapterType}`);
    }
};
