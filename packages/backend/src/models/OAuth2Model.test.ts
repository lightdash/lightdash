import { AnyType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashConfig } from '../config/parseConfig';
import { isMobileOAuthClient, OAuth2Model } from './OAuth2Model';

const lightdashConfig = {
    auth: {
        oauthServer: {
            accessTokenLifetime: 60 * 60,
            refreshTokenLifetime: 60 * 60 * 24 * 14,
            mobileRefreshTokenLifetime: 60 * 60 * 24 * 90,
            refreshTokenRotationGrace: 60,
        },
    },
} as LightdashConfig;

const mobileRedirectUri = 'com.lightdash.mobile://oauth/callback';
const cliRedirectUri = 'http://localhost:*/callback';

describe('OAuth2Model.validateRedirectUri', () => {
    const model = new OAuth2Model({} as AnyType, lightdashConfig);
    const client = {
        redirectUris: [
            'http://localhost:8100/callback',
            'http://localhost:*/callback',
            'https://example.com/*',
        ],
    };

    it('returns true for exact match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:9999/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard path match', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com/anything',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns false for non-wildcard port uri', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com:8100/anything',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for non-matching uri', async () => {
        const result = await model.validateRedirectUri(
            'http://malicious.com/callback',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for partial match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/other',
            client as AnyType,
        );
        expect(result).toBe(false);
    });
});

describe('isMobileOAuthClient', () => {
    it.each([
        [[mobileRedirectUri], true],
        [['COM.LIGHTDASH.MOBILE://oauth/callback'], true],
        [[cliRedirectUri, mobileRedirectUri], true],
        [[cliRedirectUri], false],
        [['https://com.lightdash.mobile/callback'], false],
        [[], false],
    ] as [string[], boolean][])(
        'reads %j as mobile=%s',
        (redirectUris, expected) => {
            expect(isMobileOAuthClient(redirectUris)).toBe(expected);
        },
    );

    it('reads an absent redirect uri list as not mobile', () => {
        expect(isMobileOAuthClient(null)).toBe(false);
        expect(isMobileOAuthClient(undefined)).toBe(false);
    });
});

describe('OAuth2Model refresh token rotation', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(database as unknown as Knex, lightdashConfig);
    let tracker: Tracker;

    const refreshTokenRow = (overrides: Record<string, unknown> = {}) => ({
        refresh_token: 'refresh-token',
        expires_at: new Date('2026-12-01T00:00:00.000Z'),
        revoked_at: null,
        scope: ['read'],
        client_id: 'oauth-mobile',
        redirect_uris: [mobileRedirectUri],
        grants: ['authorization_code', 'refresh_token'],
        user_id: 42,
        organization_uuid: 'organization-uuid',
        ...overrides,
    });

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('marks a rotated refresh token revoked instead of deleting it', async () => {
        tracker.on.update('oauth2_refresh_tokens').responseOnce(1);

        const revoked = await model.revokeToken({
            refreshToken: 'refresh-token',
        } as AnyType);

        expect(revoked).toBe(true);
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.update[0].sql).toContain(
            'coalesce(revoked_at, now())',
        );
    });

    it('keeps the first revocation timestamp when a client retries', async () => {
        tracker.on.update('oauth2_refresh_tokens').response(1);

        await model.revokeToken({ refreshToken: 'refresh-token' } as AnyType);
        await model.revokeToken({ refreshToken: 'refresh-token' } as AnyType);

        expect(tracker.history.update).toHaveLength(2);
        tracker.history.update.forEach((query) => {
            expect(query.sql).toContain('coalesce(revoked_at, now())');
        });
    });

    it('accepts a refresh token revoked inside the grace window', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce(
            refreshTokenRow({
                revoked_at: new Date(Date.now() - 10 * 1000),
            }),
        );

        const token = await model.getRefreshToken('refresh-token');

        expect(token).not.toBe(false);
        expect(token && token.refreshToken).toBe('refresh-token');
    });

    it('rejects a refresh token revoked before the grace window', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce(
            refreshTokenRow({
                revoked_at: new Date(Date.now() - 10 * 60 * 1000),
            }),
        );

        const token = await model.getRefreshToken('refresh-token');

        expect(token).toBe(false);
    });

    it('deletes a refresh token outright when a user revokes it', async () => {
        tracker.on.delete('oauth2_refresh_tokens').responseOnce(1);

        const deleted = await model.deleteRefreshToken('refresh-token');

        expect(deleted).toBe(true);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete[0].bindings).toContain('refresh-token');
    });

    it('deletes an access token outright when a user revokes it', async () => {
        tracker.on.delete('oauth2_access_tokens').responseOnce(1);

        const deleted = await model.deleteAccessToken('access-token');

        expect(deleted).toBe(true);
        expect(tracker.history.delete[0].bindings).toContain('access-token');
    });

    it('removes expired and long revoked tokens of the same user on save', async () => {
        tracker.on.insert('oauth2_access_tokens').responseOnce([]);
        tracker.on.insert('oauth2_refresh_tokens').responseOnce([]);
        tracker.on.delete('oauth2_refresh_tokens').responseOnce(2);

        await model.saveToken(
            {
                accessToken: 'access-token',
                accessTokenExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
                refreshToken: 'new-refresh-token',
                refreshTokenExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
                scope: ['read'],
            } as AnyType,
            { id: 'oauth-mobile' } as AnyType,
            {
                userId: 42,
                organizationUuid: 'organization-uuid',
            } as AnyType,
        );

        expect(tracker.history.delete).toHaveLength(1);
        const housekeeping = tracker.history.delete[0];
        expect(housekeeping.sql).toContain('"user_id" = $1');
        expect(housekeeping.sql).toContain('"expires_at" < CURRENT_TIMESTAMP');
        expect(housekeeping.sql).toContain("now() - interval '1 day'");
        expect(housekeeping.bindings).toContain(42);
    });
});

describe('OAuth2Model mobile refresh token lifetime', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OAuth2Model(database as unknown as Knex, lightdashConfig);
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('gives a mobile client the long refresh token lifetime', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            client_id: 'oauth-mobile',
            redirect_uris: [mobileRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
        });

        const client = await model.getClient('oauth-mobile');

        expect(client && client.refreshTokenLifetime).toBe(60 * 60 * 24 * 90);
    });

    it('leaves a non-mobile client on the server default', async () => {
        tracker.on.select('oauth2_clients').responseOnce({
            client_id: 'lightdash-cli',
            redirect_uris: [cliRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
        });

        const client = await model.getClient('lightdash-cli');

        expect(client && client.refreshTokenLifetime).toBeUndefined();
    });

    it('reports the mobile lifetime on the refresh token client', async () => {
        tracker.on.select('oauth2_refresh_tokens').responseOnce({
            refresh_token: 'refresh-token',
            expires_at: new Date('2026-12-01T00:00:00.000Z'),
            revoked_at: null,
            scope: ['read'],
            client_id: 'oauth-mobile',
            redirect_uris: [mobileRedirectUri],
            grants: ['authorization_code', 'refresh_token'],
            user_id: 42,
            organization_uuid: 'organization-uuid',
        });

        const token = await model.getRefreshToken('refresh-token');

        expect(token && token.client.refreshTokenLifetime).toBe(
            60 * 60 * 24 * 90,
        );
    });
});
