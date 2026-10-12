import { WarehouseTypes, type AiIdentitySource } from '@lightdash/common';

export const identityLabels: Record<
    AiIdentitySource,
    {
        label: string;
        description: string;
        shortLabel: string | null;
        tooltip: string;
    }
> = {
    marked_person: {
        label: 'The person',
        description:
            "Gets the access of the person asking, so the warehouse can't limit agents separately.",
        shortLabel: null,
        tooltip: "agents run as the person asking, with that person's access.",
    },
    agent_sign_in: {
        label: "The person's agent sign-in",
        description: 'People sign in once, so Snowflake can limit agents.',
        shortLabel: 'Agent sign-in',
        tooltip: "agents run as each person's agent sign-in.",
    },
    ai_service_account: {
        label: 'A shared agent account',
        description: 'One account per project, added by a project admin.',
        shortLabel: 'Shared account',
        tooltip: "agents run as each project's shared agent account.",
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
