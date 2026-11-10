import { AgentCapability, type AgentConnectionGrant } from '@lightdash/common';

export const grantFixture = (): AgentConnectionGrant => ({
    grantUuid: 'grant',
    organizationUuid: 'org',
    subjectUserUuid: 'user',
    clientId: 'client',
    credentialKind: 'oauth',
    actorKind: 'agent',
    name: 'cli',
    resource: 'https://server.example',
    refreshFamilyUuid: 'family',
    approvedCapabilities: [AgentCapability.ReadDiscover, AgentCapability.Query],
    approvedProjectUuids: ['11111111-1111-4111-8111-111111111111'],
    resourceConstraints: { version: 1 },
    grantContractVersion: 1,
    grantRevision: 1,
    approvalPolicyVersion: null,
    approvedByUserUuid: 'user',
    approvalMethod: 'browser_consent',
    approvedAt: new Date(),
    approvalRequestUuid: null,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    revokedByUserUuid: null,
    revocationReason: null,
    replacedByGrantUuid: null,
    createdAt: new Date(),
    lastUsedAt: null,
});

export const projectGrantFixture = (
    projectCapabilities: Record<string, AgentCapability[]> = {
        [grantFixture().approvedProjectUuids[0]]: [AgentCapability.Query],
        '22222222-2222-4222-8222-222222222222': [AgentCapability.DeployUpload],
    },
): AgentConnectionGrant => ({
    ...grantFixture(),
    approvedProjectUuids: Object.keys(projectCapabilities),
    approvedCapabilities: [
        ...new Set(Object.values(projectCapabilities).flat()),
    ],
    resourceConstraints: { version: 2, projectCapabilities },
});

export const malformedProjectConstraints = [
    { version: 2 },
    { version: 2, projectCapabilities: { other: [AgentCapability.Query] } },
    { version: 2, projectCapabilities: { project: ['unknown'] } },
    { version: 2, projectCapabilities: { project: ['toString'] } },
    {
        version: 2,
        projectCapabilities: {
            project: [AgentCapability.Query, AgentCapability.Query],
        },
    },
    {
        version: 2,
        projectCapabilities: { project: [AgentCapability.DeployUpload] },
    },
    { version: 2, projectCapabilities: {} },
    { version: 99 },
];
