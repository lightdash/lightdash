import { AGENT_CAPABILITY_SCOPES, AgentCapability } from '@lightdash/common';

export const agentCapabilityGroups = [
    {
        label: 'Read and query',
        capabilities: [
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
            AgentCapability.Export,
            AgentCapability.RawSql,
        ],
    },
    {
        label: 'Changes',
        capabilities: [
            AgentCapability.ContentWrite,
            AgentCapability.Delete,
            AgentCapability.Publish,
            AgentCapability.DeployUpload,
            AgentCapability.DbtWriteback,
            AgentCapability.Administration,
            AgentCapability.ExternalTools,
        ],
    },
];

export const agentCapabilityLabels: Record<
    AgentCapability,
    { label: string; description: string }
> = {
    [AgentCapability.ReadDiscover]: {
        label: 'Read and discover',
        description:
            'Find and read projects, data models, charts and dashboards.',
    },
    [AgentCapability.Query]: {
        label: 'Query data',
        description: 'Run queries through the data models.',
    },
    [AgentCapability.Export]: {
        label: 'Export results',
        description: 'Download query results and export content.',
    },
    [AgentCapability.RawSql]: {
        label: 'Raw SQL',
        description:
            'Run SQL directly. Also needs the project warehouse confirmation.',
    },
    [AgentCapability.ContentWrite]: {
        label: 'Create and edit content',
        description: 'Create or change charts, dashboards and spaces.',
    },
    [AgentCapability.Delete]: {
        label: 'Delete content',
        description: 'Delete charts, dashboards and other content.',
    },
    [AgentCapability.Publish]: {
        label: 'Publish and share',
        description: 'Publish content, share it and set up deliveries.',
    },
    [AgentCapability.DeployUpload]: {
        label: 'Deploy and upload',
        description: 'Deploy project changes and upload content.',
    },
    [AgentCapability.DbtWriteback]: {
        label: 'Write to dbt',
        description: 'Write changes back to dbt files.',
    },
    [AgentCapability.Administration]: {
        label: 'Administration',
        description: 'Use administrative actions available to agents.',
    },
    [AgentCapability.ExternalTools]: {
        label: 'External tools',
        description: 'Call tools connected through external services.',
    },
};

export const getAgentScopeLabel = (scope: string) => {
    const capability = agentCapabilityGroups
        .flatMap((group) => group.capabilities)
        .find((value) => AGENT_CAPABILITY_SCOPES[value] === scope);
    return capability ? agentCapabilityLabels[capability] : null;
};
