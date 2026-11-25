import {
    AGENT_CAPABILITY_DEFINITIONS,
    AgentCapability,
} from '@lightdash/common';

const pageDescriptions: Partial<Record<AgentCapability, string>> = {
    [AgentCapability.ReadDiscover]:
        'Find and read projects, data models, content and existing results.',
    [AgentCapability.Query]: 'Run queries through the data models.',
    [AgentCapability.Export]:
        'Download results, render charts and export content.',
    [AgentCapability.RawSql]:
        'Inspect warehouse tables and write or run SQL directly.',
    [AgentCapability.ContentWrite]:
        'Charts, dashboards, documents and data apps. Not access or sharing.',
    [AgentCapability.Delete]: 'Delete content, files and objects.',
    [AgentCapability.Publish]: 'Publish, share and schedule deliveries.',
};
export const agentPageCapabilityLabels = Object.fromEntries(
    Object.values(AgentCapability).map((capability) => [
        capability,
        {
            label: AGENT_CAPABILITY_DEFINITIONS[capability].name,
            description:
                pageDescriptions[capability] ??
                AGENT_CAPABILITY_DEFINITIONS[capability].allows,
        },
    ]),
) as Record<AgentCapability, { label: string; description: string }>;
