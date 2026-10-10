export enum AgentCapability {
    ReadDiscover = 'read_discover',
    Query = 'query',
    RawSql = 'raw_sql',
    ContentWrite = 'content_write',
    Delete = 'delete',
    Publish = 'publish',
    DeployUpload = 'deploy_upload',
    DbtWriteback = 'dbt_writeback',
    Export = 'export',
    Administration = 'administration',
    ExternalTools = 'external_tools',
}

export type AgentCapabilityDefinition = {
    capability: AgentCapability;
    shortName: string;
    name: string;
    allows: string;
    examples: readonly string[];
};

export const AGENT_CAPABILITY_DEFINITIONS: Record<
    AgentCapability,
    AgentCapabilityDefinition
> = {
    [AgentCapability.ReadDiscover]: {
        capability: AgentCapability.ReadDiscover,
        shortName: 'Read',
        name: 'Read and discover',
        allows: 'Find and read permitted projects, data models, content, context and existing results.',
        examples: [
            'Find charts',
            'Read a skill',
            'Read existing query results',
        ],
    },
    [AgentCapability.Query]: {
        capability: AgentCapability.Query,
        shortName: 'Query',
        name: 'Query data',
        allows: 'Run queries through approved data models and permitted saved content, with Raw SQL also required for SQL content.',
        examples: [
            'Run a metric query',
            'Search field values',
            'Run a saved chart through a data model',
        ],
    },
    [AgentCapability.RawSql]: {
        capability: AgentCapability.RawSql,
        shortName: 'Raw SQL',
        name: 'Raw SQL',
        allows: 'Inspect permitted warehouse tables and write or run SQL directly, subject to project scope, SQL approval and warehouse confirmation.',
        examples: ['Run SQL', 'List warehouse tables', 'Write a SQL chart'],
    },
    [AgentCapability.ContentWrite]: {
        capability: AgentCapability.ContentWrite,
        shortName: 'Create / edit',
        name: 'Create and edit content',
        allows: 'Create or edit permitted charts, dashboards, documents and data apps, without granting access changes, space creation or sharing.',
        examples: [
            'Edit chart settings',
            'Create a dashboard',
            'Draft a research report',
        ],
    },
    [AgentCapability.Delete]: {
        capability: AgentCapability.Delete,
        shortName: 'Delete',
        name: 'Delete content',
        allows: 'Delete permitted content, files and objects, subject to other required capabilities and actions reserved for people.',
        examples: [
            'Delete a chart',
            'Delete a repository file with Git repository changes (dbt)',
        ],
    },
    [AgentCapability.Publish]: {
        capability: AgentCapability.Publish,
        shortName: 'Publish',
        name: 'Publish and share',
        allows: 'Publish, share or arrange delivery of permitted content, subject to audience access and actions reserved for people.',
        examples: [
            'Promote a dashboard',
            'Share a thread',
            'Schedule a delivery with Create and edit content',
        ],
    },
    [AgentCapability.DeployUpload]: {
        capability: AgentCapability.DeployUpload,
        shortName: 'Deploy',
        name: 'Deploy and upload',
        allows: 'Deploy project changes or upload permitted files and content, subject to separate project administration rules.',
        examples: [
            'Sync a dbt project',
            'Upload a thread attachment',
            'Create a preview with other required capabilities',
        ],
    },
    [AgentCapability.DbtWriteback]: {
        capability: AgentCapability.DbtWriteback,
        shortName: 'dbt',
        name: 'Git repository changes (dbt)',
        allows: "Change any file in the project's Git repository and open, update or close pull requests; deleting a repository file also needs Delete content.",
        examples: [
            'Edit dbt files',
            'Edit project context',
            'Open, update or close a repository pull request',
        ],
    },
    [AgentCapability.Export]: {
        capability: AgentCapability.Export,
        shortName: 'Export',
        name: 'Export results',
        allows: 'Export permitted results or content into files, rendered charts or supported export destinations.',
        examples: ['Download CSV', 'Render a chart', 'Export to Google Sheets'],
    },
    [AgentCapability.Administration]: {
        capability: AgentCapability.Administration,
        shortName: 'Admin',
        name: 'Administration',
        allows: 'Perform administrative actions mapped for agents. Changes to access grants and identity that are reserved for people stay with people.',
        examples: [
            "Update a person's display name",
            'Read permitted administration metadata',
        ],
    },
    [AgentCapability.ExternalTools]: {
        capability: AgentCapability.ExternalTools,
        shortName: 'External tools',
        name: 'External tools',
        allows: 'Access tools enabled on a connected service, without granting authority for what those tools do downstream.',
        examples: [
            'Call an enabled connector tool',
            'Fetch from a connected service',
        ],
    },
};

export const getAgentCapabilityName = (capability: AgentCapability): string =>
    AGENT_CAPABILITY_DEFINITIONS[capability].name;

export const AGENT_CAPABILITY_DEFAULTS = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
] as const;

export const AGENT_PILOT_CAPABILITIES = [
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
] as const;
