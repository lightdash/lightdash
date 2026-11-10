import type { AgentConnectionSlot } from './schema';

export const slotFixture = (): AgentConnectionSlot => ({
    instanceUrl: 'https://example.com',
    organizationUuid: '11111111-1111-4111-8111-111111111111',
    personUuid: '22222222-2222-4222-8222-222222222222',
    name: 'default',
    clientId: 'lightdash-cli' as const,
    resource: 'https://example.com',
    grantUuid: '33333333-3333-4333-8333-333333333333',
    grantRevision: null,
    approvedAt: new Date(Date.now() - 3_600_000).toISOString(),
    grantExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    tokens: {
        accessToken: 'private-access',
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshToken: 'private-refresh',
        refreshTokenExpiresAt: null,
        scopes: ['read', 'write'],
        generation: 1,
        lastRefreshAttemptUuid: null,
    },
    lastReported: {
        checkedAt: new Date().toISOString(),
        limitsStatus: 'ok' as const,
        approvedProjects: [],
        effectiveProjects: [],
        status: 'active' as const,
        lastUsedAt: null,
        revokedAt: null,
    },
    refreshState: { kind: 'idle' as const },
    revokeState: { kind: 'none' as const },
});
