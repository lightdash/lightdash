import {
    BigqueryAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateClickhouseCredentials,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    clickhouseConnection,
    clickhouseSecrets,
} from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
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
import { ClickhouseAiServiceAccountCredentialResolver } from './ClickhouseAiServiceAccountCredentialResolver';

const selection = (): CredentialSelection<
    CreateClickhouseCredentials,
    AiServiceAccountSecrets
> => ({
    connection: clickhouseConnection,
    stored: clickhouseSecrets,
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
const resolver = new ClickhouseAiServiceAccountCredentialResolver();
it('validates preserve locally and rejects incorrect secret and connection discriminants', async () => {
    const input = selection();
    expect(
        await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: input.connection, stored: clickhouseSecrets });
    expect(() =>
        resolver.buildCredentials(
            { type: WarehouseTypes.BIGQUERY } as never,
            clickhouseSecrets,
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
it('rejects project owners and keeps transient clients uncached', async () => {
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
        clickhouseSecrets.password,
    );
});

it('preserves every routing field while replacing the connection login', async () => {
    const { clientCredentials, ...metadata } =
        await resolver.resolve(selection());
    expect(clientCredentials).toEqual({
        type: WarehouseTypes.CLICKHOUSE,
        host: 'warehouse.internal',
        port: 8443,
        schema: 'analytics',
        secure: true,
        timeoutSeconds: 60,
        startOfWeek: 1,
        dataTimezone: 'Europe/London',
        user: 'ai_agents',
        password: 'agent-password',
        requireUserCredentials: false,
    });
    expect(metadata).toEqual({
        clientOptions: {},
        cacheable: true,
        agentSignIn: null,
    });
});
it('dispatches Clickhouse AI credentials without a legacy fallback', async () => {
    const registry = new CredentialResolverRegistry();
    registerAiServiceAccountCredentialResolvers(registry);
    const legacy = vi.fn();
    const result = await registry.resolveCredentialSelection(
        selection(),
        legacy,
        'ai_service_account',
    );
    expect(result).toMatchObject(clickhouseSecrets);
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.CLICKHOUSE,
        'slot',
        'generation',
        'parent',
    ]);
    expect(legacy).not.toHaveBeenCalled();
});

it.each(['', '  ', undefined])('refuses a blank host %s', (host) => {
    expect(() =>
        resolver.buildCredentials(
            { ...clickhouseConnection, host } as CreateClickhouseCredentials,
            clickhouseSecrets,
        ),
    ).toThrow('Set the ClickHouse host');
});

it.each([undefined, ''])(
    'does not borrow a connection password when the slot has %s',
    (password) => {
        expect(() =>
            resolver.buildCredentials(clickhouseConnection, {
                ...clickhouseSecrets,
                password,
            } as AiServiceAccountSecrets),
        ).toThrow('complete');
    },
);

it('trims the user and preserves password bytes', () => {
    expect(
        resolver.buildCredentials(clickhouseConnection, {
            ...clickhouseSecrets,
            user: ' AI_Agents ',
            password: ' password ',
        }),
    ).toMatchObject({ user: 'AI_Agents', password: ' password ' });
});

it.each([false, true])(
    'refuses dbt conversion with explicit credentials %s',
    async (explicit) => {
        const registry = new CredentialResolverRegistry();
        registerAiServiceAccountCredentialResolvers(registry);
        const result = await registry.resolveCredentialSelection(
            selection(),
            vi.fn(),
            'ai_service_account',
        );
        expect(
            result[credentialResolution]?.toDbtTarget(result, {
                explicitCredentials: explicit,
            }),
        ).toMatchObject({ kind: 'none' });
    },
);

it.each([
    UserWarehouseCredentialPurpose.DEFAULT,
    UserWarehouseCredentialPurpose.AI,
])('rejects user-owned credentials with purpose %s', async (purpose) => {
    const input: CredentialSelection<
        CreateClickhouseCredentials,
        AiServiceAccountSecrets
    > = {
        ...selection(),
        owner: { kind: 'user', uuid: 'person', purpose },
        refreshSource: {
            credentials: clickhouseConnection,
            fallback: clickhouseConnection,
            personalCredentialPolicy: { strictPersonalOverlay: true },
        },
    };
    await expect(resolver.resolve(input)).rejects.toThrow('owner');
    expect(() => resolver.cacheKeyIdentity(input)).toThrow('owner');
});
