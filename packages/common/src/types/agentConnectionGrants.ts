import { type AgentCapability } from './agentPermissions';

export const AGENT_CONNECTION_GRANT_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const AGENT_CONNECTION_GRANT_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AGENT_CONNECTION_GRANT_CONTRACT_VERSION = 1;

export type AgentConnectionGrantResourceConstraints = {
    version: 1;
};

export type AgentConnectionGrant = {
    grantUuid: string;
    organizationUuid: string;
    subjectUserUuid: string;
    clientId: string;
    credentialKind: 'oauth';
    actorKind: 'agent';
    name: string;
    resource: string;
    refreshFamilyUuid: string | null;
    approvedCapabilities: AgentCapability[];
    approvedProjectUuids: string[];
    resourceConstraints: AgentConnectionGrantResourceConstraints;
    grantContractVersion: number;
    grantRevision: number;
    approvalPolicyVersion: number | null;
    approvedByUserUuid: string | null;
    approvalMethod: 'browser_consent';
    approvedAt: Date;
    approvalRequestUuid: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    revokedByUserUuid: string | null;
    revocationReason: string | null;
    replacedByGrantUuid: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
};

export type AgentConnectionGrantCreate = Pick<
    AgentConnectionGrant,
    | 'organizationUuid'
    | 'subjectUserUuid'
    | 'clientId'
    | 'name'
    | 'resource'
    | 'approvedCapabilities'
    | 'approvedProjectUuids'
    | 'resourceConstraints'
    | 'approvalPolicyVersion'
    | 'approvedByUserUuid'
    | 'approvalRequestUuid'
    | 'expiresAt'
>;

export type AgentConnectionGrantWithStatus = AgentConnectionGrant & {
    status: 'active' | 'expired' | 'revoked';
};
