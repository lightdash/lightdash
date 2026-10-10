import { type AgentPermissionExplanation } from './agentPermissionExplanation';
import {
    AGENT_CAPABILITY_DEFINITIONS,
    type AgentCapability,
} from './agentPermissions';
import { type UUID } from './api/uuid';

const operations = [
    {
        id: 'run_raw_sql',
        label: 'Run raw SQL',
        description: 'Run a SQL query in the selected project.',
    },
    {
        id: 'schedule_delivery',
        label: 'Schedule a delivery',
        description: 'Create a scheduled delivery of content.',
    },
    {
        id: 'export_results',
        label: 'Export results',
        description: 'Export results in a supported format.',
    },
    {
        id: 'create_edit_chart',
        label: 'Create or edit a chart',
        description: 'Create a chart or change an existing chart.',
    },
    {
        id: 'delete_content',
        label: 'Delete content',
        description: 'Delete a chart, dashboard or other content.',
    },
    {
        id: 'publish_dashboard',
        label: 'Publish a dashboard',
        description: 'Promote a dashboard to its parent project.',
    },
    {
        id: 'change_dbt_files',
        label: 'Change dbt files',
        description: 'Save changes to files in the project repository.',
    },
    {
        id: 'run_saved_sql_chart',
        label: 'Run a saved SQL chart',
        description: 'Run the query for a saved SQL chart.',
    },
    {
        id: 'delete_repository_file',
        label: 'Delete a repository file',
        description: 'Delete a file in the project repository.',
    },
    {
        id: 'change_agent_permissions',
        label: 'Change agent permissions',
        description: 'Change the organization permissions for agents.',
    },
] as const;

export type AgentAccessPreviewActionId =
    | `capability:${AgentCapability}`
    | (typeof operations)[number]['id'];

export const AGENT_ACCESS_PREVIEW_ACTIONS: readonly {
    id: AgentAccessPreviewActionId;
    label: string;
    group: 'capability' | 'operation';
    description: string;
}[] = [
    ...Object.values(AGENT_CAPABILITY_DEFINITIONS).map(
        ({ capability, name, allows }) => ({
            id: `capability:${capability}` as const,
            label: name,
            group: 'capability' as const,
            description: allows,
        }),
    ),
    ...operations.map((operation) => ({
        ...operation,
        group: 'operation' as const,
    })),
];

export type AgentAccessPreviewRequest = {
    personUuid: UUID;
    projectUuid: UUID;
    actionId: AgentAccessPreviewActionId;
};

export type ApiAgentAccessPreviewResponse = {
    status: 'ok';
    results: AgentPermissionExplanation;
};
