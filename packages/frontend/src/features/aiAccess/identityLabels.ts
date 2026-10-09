import { WarehouseTypes, type AiIdentitySource } from '@lightdash/common';

export const identityLabels: Record<
    AiIdentitySource,
    { label: string; helper: string }
> = {
    marked_person: {
        label: 'Same credentials as the user',
        helper: "Queries are tagged as agent queries. Warehouse policies can't act on the tag.",
    },
    agent_sign_in: {
        label: 'A separate agent sign-in for each person',
        helper: 'Each person connects once. Snowflake verifies these sessions.',
    },
    ai_service_account: {
        label: 'The AI service account',
        helper: "Admins add it on each project connection. Everyone's agent gets that account's access.",
    },
};

export const identityWarehouseNames = {
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
};

export const inlineIdentityLabel = (source: AiIdentitySource) => {
    const { label } = identityLabels[source];
    return `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
};

export const agentIdentitySentence = (warehouseName: string) =>
    `When AI agents query ${warehouseName}, they run as`;

export const bigQueryAgentConnectionLabel = `${identityWarehouseNames.bigquery}: Agents run as the project's AI service account. Nothing to connect.`;
