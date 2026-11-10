import { assertUnreachable, WarehouseTypes } from '@lightdash/common';

export const agentMarkerProbe = (
    type: WarehouseTypes,
): { sql: string; fallbackSql: string | null } => {
    switch (type) {
        case WarehouseTypes.POSTGRES:
            return {
                sql: "SELECT current_setting('lightdash.agent', true) AS agent, current_setting('application_name', true) AS application_name",
                fallbackSql: null,
            };
        case WarehouseTypes.REDSHIFT:
            return {
                sql: "SELECT current_setting('lightdash.agent', false) AS agent, current_setting('application_name', false) AS application_name",
                fallbackSql: null,
            };
        case WarehouseTypes.SNOWFLAKE:
            return {
                sql: "SELECT SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN AS agent, CURRENT_QUERY_TAG() AS query_tag",
                fallbackSql:
                    "SELECT SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN AS agent",
            };
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.BIGQUERY:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.DUCKDB:
            return { sql: 'SELECT 1', fallbackSql: null };
        default:
            return assertUnreachable(type, 'Unknown warehouse type');
    }
};
