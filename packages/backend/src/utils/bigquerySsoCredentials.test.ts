import {
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import {
    assertValidPersistedBigquerySsoKeyfile,
    hydrateBigquerySsoKeyfile,
    stripBigquerySsoClientSecretForPersistence,
} from './bigquerySsoCredentials';

const credentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'client',
        refresh_token: 'refresh',
        client_secret: 'secret',
        access_token: 'access',
        expiry_date: 'expiry',
        quota_project_id: 'billing',
        custom_field: 'stable',
        token_type: 'Bearer',
        id_token: 'id',
        scope: 'scope',
    },
};

it('keeps only stable SSO fields without mutating its input', () => {
    const stored = stripBigquerySsoClientSecretForPersistence(credentials, {
        oauth2ClientId: 'client',
        oauth2ClientSecret: 'configured',
    });
    expect(stored.keyfileContents).toEqual({
        type: 'authorized_user',
        client_id: 'client',
        refresh_token: 'refresh',
        quota_project_id: 'billing',
        custom_field: 'stable',
    });
    expect(credentials.keyfileContents.client_secret).toBe('secret');
    expect(stored).not.toBe(credentials);
});

it.each([
    undefined,
    BigqueryAuthenticationType.PRIVATE_KEY,
    BigqueryAuthenticationType.ADC,
])('preserves %s credentials exactly', (authenticationType) => {
    const input = { ...credentials, authenticationType };
    expect(
        stripBigquerySsoClientSecretForPersistence(input, {
            oauth2ClientId: 'client',
            oauth2ClientSecret: 'configured',
        }),
    ).toBe(input);
});

it.each([
    null,
    [],
    'not-json',
    {},
    { type: 'service_account', client_id: 'client', refresh_token: 'refresh' },
    { type: 'authorized_user', client_id: '', refresh_token: 'refresh' },
    { type: 'authorized_user', client_id: 'client', refresh_token: ' ' },
    { type: 'authorized_user', client_id: 123, refresh_token: 'refresh' },
    {
        type: 'authorized_user',
        client_id: 'client',
        refresh_token: 'refresh',
        client_secret: 123,
    },
    {
        type: 'authorized_user',
        client_id: 'client',
        refresh_token: 'refresh',
        credential_source: { url: 'https://example.com' },
    },
    {
        type: 'authorized_user',
        client_id: 'client',
        refresh_token: 'refresh',
        quota_project_id: 123,
    },
])('rejects invalid persisted SSO fields: %j', (keyfile) => {
    expect(() => assertValidPersistedBigquerySsoKeyfile(keyfile)).toThrow(
        ParameterError,
    );
});

it('accepts secret-free SSO fields', () => {
    expect(() =>
        assertValidPersistedBigquerySsoKeyfile({
            type: 'authorized_user',
            client_id: 'client',
            refresh_token: 'refresh',
        }),
    ).not.toThrow();
});

it.each([
    ['client', 'stale', 'configured'],
    ['foreign', 'foreign-secret', 'foreign-secret'],
    ['foreign', undefined, 'configured'],
])(
    'hydrates client %s with its own app secret',
    (clientId, storedSecret, expected) => {
        const keyfile = {
            ...credentials.keyfileContents,
            client_id: clientId,
            client_secret: storedSecret!,
        };
        expect(
            hydrateBigquerySsoKeyfile(keyfile, {
                oauth2ClientId: 'client',
                oauth2ClientSecret: 'configured',
            }),
        ).toEqual({ ...keyfile, client_secret: expected });
        expect(keyfile.client_secret).toBe(storedSecret);
    },
);

it('preserves a foreign client secret on write', () => {
    const input = {
        ...credentials,
        keyfileContents: {
            ...credentials.keyfileContents,
            client_id: 'foreign',
        },
    };
    expect(
        stripBigquerySsoClientSecretForPersistence(input, {
            oauth2ClientId: 'client',
            oauth2ClientSecret: 'configured',
        }).keyfileContents.client_secret,
    ).toBe('secret');
});

it.each([undefined, null, {}, { custom_field: 'legacy' }])(
    'copies unusual legacy SSO keyfiles without validation: %j',
    (keyfileContents) => {
        const input = {
            ...credentials,
            keyfileContents:
                keyfileContents as unknown as typeof credentials.keyfileContents,
        };
        expect(() =>
            stripBigquerySsoClientSecretForPersistence(input, {
                oauth2ClientId: 'client',
                oauth2ClientSecret: 'configured',
            }),
        ).not.toThrow();
    },
);

it.each([undefined, '', '   '])(
    'keeps the stored secret when the configured secret is %j',
    (oauth2ClientSecret) => {
        expect(
            hydrateBigquerySsoKeyfile(credentials.keyfileContents, {
                oauth2ClientId: 'client',
                oauth2ClientSecret,
            }).client_secret,
        ).toBe('secret');
    },
);

it.each([undefined, '', '   ', 'configured'])(
    'strips the matching client secret only when the configured secret is usable: %j',
    (oauth2ClientSecret) => {
        const result = stripBigquerySsoClientSecretForPersistence(credentials, {
            oauth2ClientId: 'client',
            oauth2ClientSecret,
        });
        expect(result.keyfileContents.client_secret).toBe(
            oauth2ClientSecret?.trim() ? undefined : 'secret',
        );
        expect(result.keyfileContents).not.toHaveProperty('access_token');
        expect(credentials.keyfileContents.client_secret).toBe('secret');
    },
);
