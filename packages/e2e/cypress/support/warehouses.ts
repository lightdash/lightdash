import { CreateWarehouseCredentials, WarehouseTypes } from '@lightdash/common';
import bigqueryCredentials from '../fixtures/credentials.json';

const warehouseConnections: Record<string, CreateWarehouseCredentials> = {
    postgresSQL: {
        host: Cypress.env('PGHOST') || 'localhost',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'postgres',
        dbname: 'postgres',
        searchPath: '',
        role: '',
        sshTunnelHost: '',
        sshTunnelUser: '',
        schema: 'jaffle',
        port: 5432,
        keepalivesIdle: 0,
        sslmode: 'disable',
        sshTunnelPort: 22,
        requireUserCredentials: false,
        type: WarehouseTypes.POSTGRES,
    },
    redshift: {
        host: Cypress.env('PGHOST') || 'localhost',
        user: 'postgres',
        password: Cypress.env('PGPASSWORD') || 'postgres',
        dbname: 'postgres',
        port: 5432,
        schema: 'jaffle',
        sslmode: 'disable',

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
    /* databricks: {
        name: 'Jaffle Databricks test',
        host: Cypress.env('DATABRICKS_HOST'),
        token: Cypress.env('DATABRICKS_TOKEN'),
        httpPath: Cypress.env('DATABRICKS_PATH'),
        schema: 'jaffle',
        type: WarehouseTypes.DATABRICKS,
    }, */
    snowflake: {
        account: Cypress.env('SNOWFLAKE_ACCOUNT'),
        user: Cypress.env('SNOWFLAKE_USER'),
        password: Cypress.env('SNOWFLAKE_PASSWORD'),
        role: 'SYSADMIN',
        database: 'SNOWFLAKE_DATABASE_STAGING',
        warehouse: 'TESTING',
        schema: 'jaffle',
        type: WarehouseTypes.SNOWFLAKE,
    },
    /* trino: {
        name: 'Jaffle Trino test',
        host: Cypress.env('TRINO_HOST'),
        port: Cypress.env('TRINO_PORT'),
        user: Cypress.env('TRINO_USER'),
        password: Cypress.env('TRINO_PASSWORD'),
        database: 'e2e_jaffle_shop',
        schema: 'e2e_jaffle_shop',
        type: 'trino'
    }, */
};

export default warehouseConnections;
