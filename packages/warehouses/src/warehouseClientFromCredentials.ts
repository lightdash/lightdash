import {
    FullWarehouseCredentials,
    UnexpectedServerError,
    WarehouseTypes,
} from '@lightdash/common';
import { WarehouseClient } from './types';
import { BigqueryWarehouseClient } from './warehouseClients/BigqueryWarehouseClient';
import { DatabricksWarehouseClient } from './warehouseClients/DatabricksWarehouseClient';
import { PostgresWarehouseClient } from './warehouseClients/PostgresWarehouseClient';
import { RedshiftWarehouseClient } from './warehouseClients/RedshiftWarehouseClient';
import { SnowflakeWarehouseClient } from './warehouseClients/SnowflakeWarehouseClient';

export const warehouseClientFromCredentials = (
    credentials: FullWarehouseCredentials,
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
        default:
            const never: never = credentials;
            throw new UnexpectedServerError(
                'Warehouse credentials type were not recognised',
            );
    }
};
