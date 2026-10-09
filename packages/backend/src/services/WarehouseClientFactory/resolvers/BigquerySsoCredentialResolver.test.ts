import {
    AuthorizationError,
    BigqueryAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { lightdashConfigWithGoogleOAuthMock } from '../../../config/lightdashConfig.mock';
import { profileFromCredentials } from '../../../dbt/profiles';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import type { CredentialSelection } from '../CredentialResolver';
import { BigquerySsoCredentialResolver } from './BigquerySsoCredentialResolver';

const stored: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'authorized_user',
        client_id:
            lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientId!,
        refresh_token: 'stored-refresh',
        quota_project_id: 'billing',
    },
};
const selection: CredentialSelection<CreateBigqueryCredentials> = {
    connection: stored,
    stored,
    owner: {
        kind: 'user',
        uuid: 'credential-uuid',
        purpose: UserWarehouseCredentialPurpose.DEFAULT,
    },
    context: connectionContextFromUser(
        { userUuid: 'person' },
        { organizationUuid: 'org', queryContext: null },
    ),
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    credentialKind: WarehouseCredentialKind.PERSONAL,
    aiPlan: null,
};
const fixture = () => {
    const getRefreshToken = vi.fn(async () => 'grant-refresh');
    const validateRefreshToken = vi.fn(async () => 'discarded-access');
    const resolver = new BigquerySsoCredentialResolver(
        () => lightdashConfigWithGoogleOAuthMock.auth.google,
        { getRefreshToken, validateRefreshToken },
    );
    return { resolver, getRefreshToken, validateRefreshToken };
};

it('preserves a supplied refresh token without an exchange and strips runtime fields', async () => {
    const { resolver, getRefreshToken, validateRefreshToken } = fixture();
    const connection = {
        ...stored,
        keyfileContents: {
            ...stored.keyfileContents,
            client_secret: 'stale-secret',
            access_token: 'transient',
            expiry_date: 'soon',
        },
    };
    const result = await resolver.validateOnSave({
        ...selection,
        connection,
        stored: connection,
        intent: { kind: 'preserve' },
    });
    expect(result).toEqual({ connection: stored, stored });
    expect(result.stored).not.toBe(connection);
    expect(connection.keyfileContents.client_secret).toBe('stale-secret');
    expect(getRefreshToken).not.toHaveBeenCalled();
    expect(validateRefreshToken).not.toHaveBeenCalled();
});

it('links the current person and validates the BigQuery scope once', async () => {
    const { resolver, getRefreshToken, validateRefreshToken } = fixture();
    const result = await resolver.validateOnSave({
        ...selection,
        intent: { kind: 'linkCurrentPerson', userUuid: 'person' },
    });
    expect(getRefreshToken).toHaveBeenCalledExactlyOnceWith('person');
    expect(validateRefreshToken).toHaveBeenCalledExactlyOnceWith(
        'grant-refresh',
    );
    expect(result.stored.keyfileContents).toEqual({
        type: 'authorized_user',
        client_id:
            lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientId,
        refresh_token: 'grant-refresh',
    });
});

it.each(['provider rejected', 'missing bigquery scope'])(
    'preserves the token validation error: %s',
    async (message) => {
        const { resolver, validateRefreshToken } = fixture();
        const error = new AuthorizationError(message);
        validateRefreshToken.mockRejectedValue(error);
        await expect(
            resolver.validateOnSave({
                ...selection,
                intent: { kind: 'linkCurrentPerson', userUuid: 'person' },
            }),
        ).rejects.toBe(error);
    },
);

it('accepts a verified callback without another exchange', async () => {
    const { resolver, getRefreshToken, validateRefreshToken } = fixture();
    const result = await resolver.validateOnSave({
        ...selection,
        intent: {
            kind: 'verifiedGoogleCallback',
            refreshToken: 'callback-refresh',
        },
    });
    expect(result.stored.keyfileContents.refresh_token).toBe(
        'callback-refresh',
    );
    expect(result.stored.keyfileContents).not.toHaveProperty('client_secret');
    expect(getRefreshToken).not.toHaveBeenCalled();
    expect(validateRefreshToken).not.toHaveBeenCalled();
});

it('resolves old and new rows identically without grant lookup, validation or mutation', async () => {
    const { resolver, getRefreshToken, validateRefreshToken } = fixture();
    const legacy = {
        ...stored,
        keyfileContents: {
            ...stored.keyfileContents,
            client_secret: 'old-secret',
        },
    };
    const current = await resolver.resolve(selection);
    expect(
        await resolver.resolve({
            ...selection,
            connection: legacy,
            stored: legacy,
        }),
    ).toEqual(current);
    expect(current).toEqual({
        clientCredentials: {
            ...stored,
            keyfileContents: {
                ...stored.keyfileContents,
                client_secret:
                    lightdashConfigWithGoogleOAuthMock.auth.google
                        .oauth2ClientSecret,
            },
        },
        clientOptions: {},
        cacheable: true,
    });
    expect(stored.keyfileContents).not.toHaveProperty('client_secret');
    expect(legacy.keyfileContents.client_secret).toBe('old-secret');
    expect(getRefreshToken).not.toHaveBeenCalled();
    expect(validateRefreshToken).not.toHaveBeenCalled();
    await expect(resolver.dispose()).resolves.toBeUndefined();
});

it('uses the runtime secret for dbt while the stored row stays secret-free', async () => {
    const { resolver } = fixture();
    const result = await resolver.resolve(selection);
    const profile = profileFromCredentials(
        result.clientCredentials,
        '/tmp/profiles',
    );
    expect(profile.environment.LIGHTDASH_DBT_PROFILE_VAR_CLIENT_SECRET).toBe(
        lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientSecret,
    );
    expect(stored.keyfileContents).not.toHaveProperty('client_secret');
});

it('hashes token identity and separates owners and reconnects', () => {
    const { resolver } = fixture();
    const identity = resolver.cacheKeyIdentity(selection);
    expect(identity).toEqual([
        'bigquery-sso-v1',
        'user',
        'credential-uuid',
        lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientId,
        createHash('sha256').update('stored-refresh').digest('hex'),
    ]);
    expect(JSON.stringify(identity)).not.toContain('stored-refresh');
    expect(
        resolver.cacheKeyIdentity({
            ...selection,
            owner: { kind: 'project', uuid: 'project' },
        }),
    ).not.toEqual(identity);
    expect(
        resolver.cacheKeyIdentity({
            ...selection,
            stored: {
                ...stored,
                keyfileContents: {
                    ...stored.keyfileContents,
                    refresh_token: 'reconnect',
                },
            },
        }),
    ).not.toEqual(identity);
});

it.each([
    ['foreign-secret', 'foreign-secret'],
    [
        undefined,
        lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientSecret,
    ],
])(
    'uses the foreign app secret or config fallback: %s',
    async (clientSecret, expected) => {
        const { resolver, getRefreshToken, validateRefreshToken } = fixture();
        const foreign = {
            ...stored,
            keyfileContents: {
                ...stored.keyfileContents,
                client_id: 'foreign-app',
                ...(clientSecret === undefined
                    ? {}
                    : { client_secret: clientSecret }),
            },
        };
        const input = { ...selection, connection: foreign, stored: foreign };
        const saved = await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        });
        expect(saved.stored).toEqual(foreign);
        const resolved = await resolver.resolve(input);
        expect(resolved.clientCredentials.keyfileContents.client_secret).toBe(
            expected,
        );
        expect(getRefreshToken).not.toHaveBeenCalled();
        expect(validateRefreshToken).not.toHaveBeenCalled();
    },
);

it('hydrates unusual legacy keyfiles without applying save validation', async () => {
    const { resolver } = fixture();
    const legacy = { ...stored, keyfileContents: { custom_field: 'legacy' } };
    const result = await resolver.resolve({
        ...selection,
        connection: legacy,
        stored: legacy,
    });
    expect(result.clientCredentials.keyfileContents).toEqual({
        custom_field: 'legacy',
        client_secret:
            lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientSecret,
    });
});

it.each([undefined, '', '   '])(
    'resolves with the stored secret when the configured secret is %j',
    async (oauth2ClientSecret) => {
        const resolver = new BigquerySsoCredentialResolver(
            () => ({
                ...lightdashConfigWithGoogleOAuthMock.auth.google,
                oauth2ClientSecret,
            }),
            null,
        );
        const connection = {
            ...stored,
            keyfileContents: {
                ...stored.keyfileContents,
                client_secret: 'stored-secret',
            },
        };
        const result = await resolver.resolve({
            ...selection,
            connection,
            stored: connection,
        });
        expect(result.clientCredentials.keyfileContents.client_secret).toBe(
            'stored-secret',
        );
        expect(connection.keyfileContents.client_secret).toBe('stored-secret');
    },
);

it.each([undefined, '', '   ', 'configured-secret'])(
    'preserves the only usable secret on save when the configured secret is %j',
    async (oauth2ClientSecret) => {
        const resolver = new BigquerySsoCredentialResolver(
            () => ({
                ...lightdashConfigWithGoogleOAuthMock.auth.google,
                oauth2ClientSecret,
            }),
            null,
        );
        const connection = {
            ...stored,
            keyfileContents: {
                ...stored.keyfileContents,
                client_secret: 'stored-secret',
            },
        };
        const result = await resolver.validateOnSave({
            ...selection,
            connection,
            stored: connection,
            intent: { kind: 'preserve' },
        });
        expect(result.stored.keyfileContents.client_secret).toBe(
            oauth2ClientSecret?.trim() ? undefined : 'stored-secret',
        );
        expect(connection.keyfileContents.client_secret).toBe('stored-secret');
    },
);
