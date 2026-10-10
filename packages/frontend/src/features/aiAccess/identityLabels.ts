import { WarehouseTypes, type AiIdentitySource } from '@lightdash/common';

export const identityLabels: Record<
    AiIdentitySource,
    { label: string; helper: string }
> = {
    marked_person: {
        label: 'The person',
        helper: "Agents get the access of the person asking. Their queries are labelled, but warehouse rules can't act on the label.",
    },
    agent_sign_in: {
        label: "The person's agent sign-in",
        helper: 'Each person signs in to Snowflake once for their agent. Snowflake marks these sessions, so your policies can limit them.',
    },
    ai_service_account: {
        label: 'A shared agent account',
        helper: 'A project admin adds one account to each project. All agents run as it and get only its access.',
    },
};

export const identityWarehouseNames = {
    [WarehouseTypes.POSTGRES]: 'Postgres',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.TRINO]: 'Trino',
    [WarehouseTypes.CLICKHOUSE]: 'ClickHouse',
    [WarehouseTypes.ATHENA]: 'Athena',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
};
