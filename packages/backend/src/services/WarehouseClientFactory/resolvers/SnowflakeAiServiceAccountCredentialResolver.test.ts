import {
    BigqueryAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { snowflakeSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import { registerAiServiceAccountCredentialResolvers } from '../aiServiceAccountCredentialResolvers';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import {
    credentialResolution,
    type CredentialSelection,
} from '../CredentialResolver';
import { CredentialResolverRegistry } from '../CredentialResolverRegistry';
import { SnowflakeAiServiceAccountCredentialResolver } from './SnowflakeAiServiceAccountCredentialResolver';

const selection = (): CredentialSelection<
    CreateSnowflakeCredentials,
    AiServiceAccountSecrets
> => ({
    connection: {
        ...snowflakeSecrets,
        account: 'connection_account',
        database: 'connection_database',
        schema: 'connection_schema',
        user: 'person',
        privateKey: 'person-key',
        privateKeyPass: 'person-pass',
        role: 'person-role',
        warehouse: 'person-warehouse',
        authenticationType: SnowflakeAuthenticationType.SSO,
        requireUserCredentials: true,
        queryTag: 'custom',
        override: true,
    },
    stored: snowflakeSecrets,
    owner: {
        kind: 'aiServiceAccount',
        uuid: 'slot',
        identityUuid: 'generation',
        sourceProjectUuid: 'parent',
    },
    context: connectionContextFromUser(
        { userUuid: 'person' },
        { organizationUuid: 'org', queryContext: null },
    ),
    projectUuid: 'preview',
    warehouseConnectionUuid: null,
    credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
    aiPlan: null,
});
const resolver = new SnowflakeAiServiceAccountCredentialResolver();
it.each([true, false])(
    'takes only routing from the connection with override=%s',
    async (override) => {
        const input = selection();
        const connection = {
            ...input.connection,
            override,
            password: 'person-password',
            token: 'person-token',
            refreshToken: 'person-refresh',
            organizationWarehouseCredentialsUuid: 'org-secret',
            userWarehouseCredentialsUuid: 'person-secret',
            requireAgentSession: true,
            unknown: 'unknown',
            sshTunnelHost: 'tunnel',
            sshTunnelPrivateKey: 'tunnel-key',
        };
        const result = await resolver.resolve({ ...input, connection });
        expect(result).toEqual({
            clientCredentials: {
                ...snowflakeSecrets,
                account: 'connection_account',
                database: 'connection_database',
                schema: 'connection_schema',
                override,
                requireUserCredentials: false,
            },
            clientOptions: {},
            agentSignIn: null,
            cacheable: true,
        });
    },
);
it.each([
    SnowflakeAuthenticationType.PASSWORD,
    SnowflakeAuthenticationType.SSO,
])('dispatches AI mode ahead of %s auth', async (authenticationType) => {
    const registry = new CredentialResolverRegistry();
    registerAiServiceAccountCredentialResolvers(registry);
    const personalResolve = vi.fn();
    registry.register(WarehouseTypes.SNOWFLAKE, authenticationType, {
        resolve: personalResolve,
        validateOnSave: vi.fn(),
        cacheKeyIdentity: vi.fn(),
        toDbtTarget: vi.fn(() => ({
            kind: 'none' as const,
            reason: 'Mock credentials cannot run dbt.',
        })),
        dispose: vi.fn(),
    });
    const input = selection();
    const legacy = vi.fn();
    const result = await registry.resolveCredentialSelection(
        { ...input, connection: { ...input.connection, authenticationType } },
        legacy,
        'ai_service_account',
    );
    expect(result).toMatchObject(snowflakeSecrets);
    expect(result[credentialResolution]?.clientOptions).toEqual({});
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.SNOWFLAKE,
        'slot',
        'generation',
        'parent',
    ]);
    expect(personalResolve).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
});
it('validates preserve locally and rejects incorrect secret and connection discriminants', async () => {
    const input = selection();
    expect(
        await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: input.connection, stored: snowflakeSecrets });
    expect(() =>
        resolver.buildCredentials(
            { type: WarehouseTypes.BIGQUERY } as never,
            snowflakeSecrets,
        ),
    ).toThrow('match');
    expect(() =>
        resolver.buildCredentials(input.connection, {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            keyfileContents: {
                type: 'service_account',
                private_key: 'key',
                client_email: 'agent@example.com',
            },
        }),
    ).toThrow('match');
});
it.each([
    { kind: 'linkCurrentPerson', userUuid: 'person' },
    { kind: 'verifiedGoogleCallback', refreshToken: 'token' },
] as const)('rejects $kind', async (intent) => {
    await expect(
        resolver.validateOnSave({ ...selection(), intent }),
    ).rejects.toThrow('person sign-in');
});
it('rejects personal owners and keeps transient clients uncached', async () => {
    const input = selection();
    await expect(
        resolver.resolve({
            ...input,
            owner: { kind: 'project', uuid: 'project' },
        }),
    ).rejects.toThrow('owner');
    expect(() =>
        resolver.cacheKeyIdentity({
            ...input,
            owner: { kind: 'project', uuid: 'project' },
        }),
    ).toThrow('owner');
    expect((await resolver.resolve({ ...input, owner: null })).cacheable).toBe(
        false,
    );
});
it.each([
    { uuid: 'other-slot' },
    { identityUuid: 'new-generation' },
    { sourceProjectUuid: 'other-parent' },
])('isolates cache identity for %j without key material', (change) => {
    const input = selection();
    expect(
        resolver.cacheKeyIdentity({
            ...input,
            owner: {
                kind: 'aiServiceAccount',
                uuid: 'slot',
                identityUuid: 'generation',
                sourceProjectUuid: 'parent',
                ...change,
            },
        }),
    ).not.toEqual(resolver.cacheKeyIdentity(input));
    expect(JSON.stringify(resolver.cacheKeyIdentity(input))).not.toContain(
        snowflakeSecrets.privateKey,
    );
});
