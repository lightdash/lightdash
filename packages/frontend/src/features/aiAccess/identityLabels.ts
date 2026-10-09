import { WarehouseTypes, type AiIdentitySource } from '@lightdash/common';

export const identityLabels: Record<
    AiIdentitySource,
    { label: string; helper: string }
> = {
    marked_person: {
        label: 'Same credentials as the user',
        helper: "Agents get the same access as the person asking. Agent queries are labelled, but warehouse rules can't use the label.",
    },
    agent_sign_in: {
        label: 'A separate agent sign-in for each person',
        helper: 'Each person signs in to Snowflake once for their agent. Snowflake marks these sessions, so your Snowflake policies can limit them.',
    },
    ai_service_account: {
        label: 'The AI service account',
        helper: "Agents run as one account that a project admin adds to each project. Everyone's agent gets that account's access.",
    },
};

export const identityWarehouseNames = {
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
};
