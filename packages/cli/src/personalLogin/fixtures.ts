import { type PersonalLogin } from './schema';

export const loginFixture = (): PersonalLogin => ({
    clientId: 'lightdash-cli',
    personUuid: '22222222-2222-4222-8222-222222222222',
    organizationUuid: '11111111-1111-4111-8111-111111111111',
    tokens: {
        accessToken: 'personal-access',
        accessTokenIssuedAt: new Date(Date.now() - 1000).toISOString(),
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        refreshToken: 'personal-refresh',
        scopes: ['read', 'write'],
        generation: 1,
        lastRefreshAttemptUuid: null,
    },
    sessionExpiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    refreshState: { kind: 'idle' },
});
