import { capitalize, WarehouseTypes } from '@lightdash/common';

export const getSsoLabel = (warehouse: WarehouseTypes, provider?: string) =>
    `User Account (Sign in with ${provider ?? capitalize(warehouse)})`;
export const PRIVATE_KEY_LABEL = `Key Pair (private key file)`;
export const PASSWORD_LABEL = `Password`;
export const EXTERNAL_BROWSER_LABEL = `External Browser`;
export const PERSONAL_ACCESS_TOKEN_LABEL = `Personal Access Token`;
export const NONE_LABEL = `None`;
export const CLI_SSO_LABEL = `Connect via Lightdash CLI (SSO)`;

// BigQuery and Databricks keep their schema in legacy-named fields
const SCHEMA_FIELDS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.BIGQUERY]: 'warehouse.dataset',
    [WarehouseTypes.POSTGRES]: 'warehouse.schema',
    [WarehouseTypes.REDSHIFT]: 'warehouse.schema',
    [WarehouseTypes.SNOWFLAKE]: 'warehouse.schema',
    [WarehouseTypes.DATABRICKS]: 'warehouse.database',
    [WarehouseTypes.TRINO]: 'warehouse.schema',
    [WarehouseTypes.CLICKHOUSE]: 'warehouse.schema',
    [WarehouseTypes.ATHENA]: 'warehouse.schema',
    [WarehouseTypes.DUCKDB]: 'warehouse.schema',
};

export const getSchemaField = (warehouseType: WarehouseTypes) =>
    SCHEMA_FIELDS[warehouseType];

// The schema input is rendered with the dbt settings, so it belongs to the dbt step
export const isDbtStepField = (path: string, warehouseType: WarehouseTypes) =>
    path.startsWith('dbt') || path === SCHEMA_FIELDS[warehouseType];
