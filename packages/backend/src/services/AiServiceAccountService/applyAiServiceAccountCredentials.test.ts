import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountCredentialInput,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    applyAiServiceAccountCredentials,
    mergeAiServiceAccountCredentials,
} from './applyAiServiceAccountCredentials';

const secrets = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        client_email: 'agent@example.com',
        private_key: 'slot-key',
    },
} as const;
const connection = {
    type: WarehouseTypes.BIGQUERY,
    project: 'canonical',
    dataset: 'dataset',
    executionProject: 'billing',
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: { refresh_token: 'personal' },
    requireUserCredentials: true,
    allowUserCredentials: true,
    location: 'EU',
    timeoutSeconds: 60,
    priority: 'batch',
    retries: 3,
    maximumBytesBilled: 100,
} as const;

it('replaces the whole BigQuery key file and preserves query settings', () => {
    expect(applyAiServiceAccountCredentials(connection, secrets)).toEqual({
        ...connection,
        ...secrets,
        requireUserCredentials: false,
        allowUserCredentials: false,
    });
    expect(connection.keyfileContents).toEqual({ refresh_token: 'personal' });
});

it('removes inherited auth fields and preserves tunnel configuration', () => {
    const inherited = {
        ...connection,
        token: 'personal-token',
        refreshToken: 'personal-refresh',
        organizationWarehouseCredentialsUuid: 'org-pointer',
        personalAccessToken: 'personal-access',
        user: 'person',
        password: 'password',
        privateKey: 'key',
        privateKeyPass: 'pass',
        oauthClientId: 'id',
        oauthClientSecret: 'secret',
        accessKeyId: 'aws-id',
        secretAccessKey: 'aws-secret',
        sessionToken: 'aws-session',
        requireAgentSession: true,
        sshTunnelHost: 'tunnel',
        sshTunnelPrivateKey: 'tunnel-key',
    };
    expect(applyAiServiceAccountCredentials(inherited, secrets)).toEqual({
        ...connection,
        ...secrets,
        requireUserCredentials: false,
        allowUserCredentials: false,
        sshTunnelHost: 'tunnel',
        sshTunnelPrivateKey: 'tunnel-key',
    });
});

it.each(
    Object.values(WarehouseTypes).filter(
        (type) => type !== WarehouseTypes.BIGQUERY,
    ),
)('rejects unsupported %s connections', (type) => {
    expect(() =>
        applyAiServiceAccountCredentials(
            { type } as CreateWarehouseCredentials,
            secrets,
        ),
    ).toThrow('does not support');
});

it('retains an omitted key file', () => {
    expect(
        mergeAiServiceAccountCredentials(
            {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            },
            secrets,
        ),
    ).toEqual(secrets);
});

it('replaces a submitted key file without borrowing saved fields', () => {
    const replacement = {
        type: 'service_account',
        client_email: 'new@example.com',
        private_key: 'new-key',
    };
    expect(
        mergeAiServiceAccountCredentials(
            { ...secrets, keyfileContents: replacement },
            secrets,
        ).keyfileContents,
    ).toEqual(replacement);
    expect(() =>
        mergeAiServiceAccountCredentials(
            {
                ...secrets,
                keyfileContents: {
                    type: 'service_account',
                    client_email: 'new@example.com',
                },
            },
            secrets,
        ),
    ).toThrow('valid');
});

it.each(['authorized_user', 'external_account', undefined])(
    'rejects BigQuery key type %s',
    (type) => {
        expect(() =>
            mergeAiServiceAccountCredentials(
                {
                    ...secrets,
                    keyfileContents: {
                        private_key: 'key',
                        client_email: 'agent@example.com',
                        ...(type ? { type } : {}),
                    },
                },
                null,
            ),
        ).toThrow('service account');
    },
);

it('rejects incomplete new slots and extra fields', () => {
    expect(() =>
        mergeAiServiceAccountCredentials(
            {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            },
            null,
        ),
    ).toThrow('complete');
    expect(() =>
        mergeAiServiceAccountCredentials(
            { ...secrets, token: 'inherited' } as typeof secrets,
            null,
        ),
    ).toThrow('complete');
});

it('rejects a method change rather than retaining secrets for it', () => {
    const input = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.SSO,
    } as unknown as AiServiceAccountCredentialInput;
    expect(() => mergeAiServiceAccountCredentials(input, secrets)).toThrow(
        'complete',
    );
});

it('allows routing and transport fields while dropping unrecognised connection identities', () => {
    const routing = {
        threads: 4,
        startOfWeek: 1,
        dataTimezone: 'Europe/London',
        accessUrl: 'https://warehouse.test',
        useSshTunnel: true,
        sshTunnelHost: 'tunnel',
        sshTunnelPort: 22,
        sshTunnelUser: 'transport-user',
        sshTunnelPublicKey: 'public',
        sshTunnelPrivateKey: 'transport-key',
    } as const;
    const poisoned = {
        ...connection,
        ...routing,
        role: 'admin',
        dbGroups: ['privileged'],
        autoCreate: true,
        assumeRoleArn: 'arn:connection',
        externalId: 'connection-id',
        userWarehouseCredentialsUuid: 'person',
        sslcert: 'person-cert',
        sslkey: 'person-key',
        unknownIdentity: 'future-auth',
    };
    expect(applyAiServiceAccountCredentials(poisoned, secrets)).toEqual({
        ...connection,
        ...routing,
        ...secrets,
        requireUserCredentials: false,
        allowUserCredentials: false,
    });
});
