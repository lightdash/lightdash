import {
    AGENT_CAPABILITY_DEFAULTS,
    AgentCapability,
} from '../types/agentPermissions';
import { type ScopeName } from '../types/scopes';

export const AGENT_CAPABILITY_SCOPES = {
    [AgentCapability.ReadDiscover]: 'view:AgentReadDiscover',
    [AgentCapability.Query]: 'view:AgentQuery',
    [AgentCapability.RawSql]: 'view:AgentRawSql',
    [AgentCapability.ContentWrite]: 'view:AgentContentWrite',
    [AgentCapability.Delete]: 'view:AgentDelete',
    [AgentCapability.Publish]: 'view:AgentPublish',
    [AgentCapability.DeployUpload]: 'view:AgentDeployUpload',
    [AgentCapability.DbtWriteback]: 'view:AgentDbtWriteback',
    [AgentCapability.Export]: 'view:AgentExport',
    [AgentCapability.Administration]: 'view:AgentAdministration',
    [AgentCapability.ExternalTools]: 'view:AgentExternalTools',
} as const satisfies Record<AgentCapability, ScopeName>;

export type AgentCapabilityScopeName =
    (typeof AGENT_CAPABILITY_SCOPES)[AgentCapability];

type ScopeSubject<T> = T extends `view:${infer S}` ? S : never;

export type AgentCapabilitySubjectName = ScopeSubject<AgentCapabilityScopeName>;

export const AGENT_SCOPE_CAPABILITIES = Object.fromEntries(
    Object.entries(AGENT_CAPABILITY_SCOPES).map(([capability, scope]) => [
        scope,
        capability,
    ]),
) as Record<AgentCapabilityScopeName, AgentCapability>;

export const AGENT_CAPABILITY_SUBJECTS = Object.values(
    AGENT_CAPABILITY_SCOPES,
).map((scope) => scope.slice('view:'.length) as AgentCapabilitySubjectName);

export const AGENT_DEFAULT_CAPABILITY_SUBJECTS = AGENT_CAPABILITY_DEFAULTS.map(
    (capability) =>
        AGENT_CAPABILITY_SCOPES[capability].slice(
            'view:'.length,
        ) as AgentCapabilitySubjectName,
);
