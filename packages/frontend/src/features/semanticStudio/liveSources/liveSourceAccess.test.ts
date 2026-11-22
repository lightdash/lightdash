import {
    ApiConnectorType,
    POSTHOG_REGION_ORIGINS,
    type ExternalConnection,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getAccountField,
    getLiveSourceAccess,
    getTokenLabel,
    toLiveSourceAccessUpdate,
    toLiveSourceAccessValues,
} from './liveSourceAccess';
import { type LiveSourceConnection } from './liveSourceRows';

const postHog = (type: ExternalConnection['type']): LiveSourceConnection =>
    ({
        externalConnectionUuid: 'uuid',
        name: 'PostHog',
        kind: 'live_source',
        type,
        origin: POSTHOG_REGION_ORIGINS.eu,
        aiHint: 'Product analytics',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '42' },
    }) as LiveSourceConnection;

describe('liveSourceAccess', () => {
    it('edits a signed-in source by name and hint only', () => {
        const connection = postHog('oauth_authorization_code');
        const access = getLiveSourceAccess(connection);
        expect(access.kind).toBe('signedIn');
        expect(getAccountField(access)).toBeNull();
        expect(getTokenLabel(access)).toBeNull();
        expect(
            toLiveSourceAccessUpdate(connection, access, {
                ...toLiveSourceAccessValues(connection, access),
                name: ' Product ',
                aiHint: ' EU app ',
            }),
        ).toEqual({ name: 'Product', aiHint: 'EU app' });
    });

    it('edits a PostHog key source in place, keeping its region', () => {
        const connection = postHog('bearer_token');
        const access = getLiveSourceAccess(connection);
        expect(access.kind).toBe('posthogKey');
        expect(getTokenLabel(access)).toBe('Personal API key');
        expect(getAccountField(access)?.validate('abc')).not.toBeNull();
        const values = toLiveSourceAccessValues(connection, access);
        expect(values).toEqual({
            name: 'PostHog',
            aiHint: 'Product analytics',
            accountId: '42',
            token: '',
            region: 'eu',
        });
        expect(
            toLiveSourceAccessUpdate(connection, access, {
                ...values,
                accountId: '7',
                token: 'phx_new',
            }),
        ).toMatchObject({
            origin: POSTHOG_REGION_ORIGINS.eu,
            apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '7' },
            secret: 'phx_new',
            aiHint: 'Product analytics',
        });
        expect(
            toLiveSourceAccessUpdate(connection, access, {
                ...values,
                region: 'us',
            }),
        ).toMatchObject({ origin: POSTHOG_REGION_ORIGINS.us });
    });
});
