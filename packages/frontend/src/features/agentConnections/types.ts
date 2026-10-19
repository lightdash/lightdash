import { type AgentCapability } from '@lightdash/common';

export type AgentConnectionRecord = {
    grantUuid: string;
    name: string;
    clientId: string;
    limitsStatus: 'ok' | 'invalid';
    approvedProjects: {
        projectUuid: string;
        name: string | null;
        approvedCapabilities: AgentCapability[];
    }[];
    approvedAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    status: 'active' | 'expired' | 'revoked';
    revokedAt: string | null;
};

export type AgentConnectionStatus = AgentConnectionRecord & {
    effectiveProjects: {
        projectUuid: string;
        capabilities: {
            capability: AgentCapability;
            allowed: boolean;
            reason:
                | 'invalid_grant'
                | 'not_supported'
                | 'revoked'
                | 'expired'
                | 'agent_identity_disabled'
                | 'project_access'
                | 'person_permission'
                | 'agent_policy'
                | null;
        }[];
    }[];
};
