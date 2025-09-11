import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: JSON import for BigQuery credentials
import bigqueryCredentials from '../fixtures/credentials.json';

const warehouseConnections: Record<string, CreateWarehouseCredentials> = {
    postgresSQL: {
        host: process.env.PGHOST || 'db-dev',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'password',
        dbname: 'postgres',
        schema: 'jaffle',
        port: Number(process.env.PGPORT || 5432),
        sslmode: 'disable' as const,
        type: WarehouseTypes.POSTGRES,
    },
    redshift: {
        host: process.env.PGHOST || 'db-dev',
        user: 'postgres',
        password: process.env.PGPASSWORD || 'password',
        dbname: 'postgres',
        port: Number(process.env.PGPORT || 5432),
        schema: 'jaffle',
        sslmode: 'disable' as const,
        type: WarehouseTypes.REDSHIFT,
    },
    bigQuery: {
        project: 'lightdash-database-staging',
        location: 'europe-west1',
        dataset: 'e2e_jaffle_shop',
        keyfileContents: bigqueryCredentials,
        timeoutSeconds: undefined,
        priority: 'interactive',
        retries: 0,
        maximumBytesBilled: undefined,
        type: WarehouseTypes.BIGQUERY,
    },
    // Disabled until we can get test cluster running
    /* databricks: {
        catalog: 'lightdash_staging',
        serverHostName: process.env.DATABRICKS_HOST,
        personalAccessToken: process.env.DATABRICKS_TOKEN,
        httpPath: process.env.DATABRICKS_PATH,
        database: 'jaffle',
        type: WarehouseTypes.DATABRICKS,
    }, */
    snowflake: {
        account: process.env.SNOWFLAKE_ACCOUNT as string,
        user: process.env.SNOWFLAKE_USER as string,
        password: process.env.SNOWFLAKE_PASSWORD as string,
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'JAFFLE',
        type: WarehouseTypes.SNOWFLAKE,
    },
    /* trino: {
        name: 'Jaffle Trino test',
        host: process.env.TRINO_HOST,
        port: process.env.TRINO_PORT,
        user: process.env.TRINO_USER,
        password: process.env.TRINO_PASSWORD,
        database: 'e2e_jaffle_shop',
        schema: 'e2e_jaffle_shop',
        type: 'trino'
    }, */
};

export function isSnowflakeConfigured() {
    return !!(
        process.env.SNOWFLAKE_ACCOUNT &&
        process.env.SNOWFLAKE_USER &&
        process.env.SNOWFLAKE_PASSWORD
    );
}

export function isBigQueryConfigured() {
    return !!warehouseConnections.bigQuery.keyfileContents;
}

export default warehouseConnections;
