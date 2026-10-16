import {
    AGENT_CAPABILITY_DEFINITIONS,
    AGENT_CAPABILITY_SCOPES,
    AgentCapability,
} from '@lightdash/common';
import i18n from '../../i18n/i18n';

const tr = (key: string) => i18n.t(key, { ns: 'aiAccess' });

export const agentCapabilityGroups = [
    {
        key: 'readAndQuery',
        get label() {
            return tr('capabilityGroups.readAndQuery');
        },
        capabilities: [
            AgentCapability.ReadDiscover,
            AgentCapability.Query,
            AgentCapability.Export,
            AgentCapability.RawSql,
        ],
    },
    {
        key: 'changes',
        get label() {
            return tr('capabilityGroups.changes');
        },
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

const capabilityKeys: Record<AgentCapability, string> = {
    [AgentCapability.ReadDiscover]: 'readDiscover',
    [AgentCapability.Query]: 'query',
    [AgentCapability.Export]: 'export',
    [AgentCapability.RawSql]: 'rawSql',
    [AgentCapability.ContentWrite]: 'contentWrite',
    [AgentCapability.Delete]: 'delete',
    [AgentCapability.Publish]: 'publish',
    [AgentCapability.DeployUpload]: 'deployUpload',
    [AgentCapability.DbtWriteback]: 'dbtWriteback',
    [AgentCapability.Administration]: 'administration',
    [AgentCapability.ExternalTools]: 'externalTools',
};

export const getAgentScopeLabel = (scope: string) => {
    const capability = agentCapabilityGroups
        .flatMap((group) => group.capabilities)
        .find((value) => AGENT_CAPABILITY_SCOPES[value] === scope);
    if (!capability) return null;
    const key = capabilityKeys[capability];
    return {
        label: tr(`capabilities.${key}.label`),
        description: tr(`capabilities.${key}.description`),
    };
};

const pageDescriptionCapabilities = new Set<AgentCapability>([
    AgentCapability.ReadDiscover,
    AgentCapability.Query,
    AgentCapability.Export,
    AgentCapability.RawSql,
    AgentCapability.ContentWrite,
    AgentCapability.Delete,
    AgentCapability.Publish,
]);
export const agentPageCapabilityLabels = Object.fromEntries(
    Object.values(AgentCapability).map((capability) => [
        capability,
        {
            label: AGENT_CAPABILITY_DEFINITIONS[capability].name,
            get description() {
                return pageDescriptionCapabilities.has(capability)
                    ? tr(
                          `capabilities.${capabilityKeys[capability]}.pageDescription`,
                      )
                    : AGENT_CAPABILITY_DEFINITIONS[capability].allows;
            },
        },
    ]),
) as Record<AgentCapability, { label: string; description: string }>;
