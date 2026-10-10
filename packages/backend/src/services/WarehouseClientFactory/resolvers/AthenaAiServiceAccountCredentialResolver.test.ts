import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    athenaConnection,
    athenaSecrets,
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
import { AthenaAiServiceAccountCredentialResolver } from './AthenaAiServiceAccountCredentialResolver';

const selection = (): CredentialSelection<
    CreateAthenaCredentials,
    AiServiceAccountSecrets
> => ({
    connection: athenaConnection,
    stored: athenaSecrets,
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
const resolver = new AthenaAiServiceAccountCredentialResolver();
it('takes exactly routing fields from the connection and identity from the slot', async () => {
    const result = await resolver.resolve(selection());
    expect(result).toEqual({
        clientCredentials: {
            ...athenaSecrets,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            threads: 2,
            numRetries: 1,
            startOfWeek: 1,
            dataTimezone: 'UTC',
            requireUserCredentials: false,
        },
        clientOptions: {},
        cacheable: true,
        agentSignIn: null,
    });
});
it.each([
    AthenaAuthenticationType.IAM_ROLE,
    AthenaAuthenticationType.WEB_IDENTITY,
])('dispatches AI mode ahead of %s auth', async (authenticationType) => {
    const registry = new CredentialResolverRegistry();
    registerAiServiceAccountCredentialResolvers(registry);
    const personalResolve = vi.fn();
    registry.register(WarehouseTypes.ATHENA, authenticationType, {
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
    expect(result).toMatchObject(athenaSecrets);
    expect(result[credentialResolution]?.clientOptions).toEqual({});
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.ATHENA,
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
    ).toEqual({ connection: input.connection, stored: athenaSecrets });
    expect(() =>
        resolver.buildCredentials(
            { type: WarehouseTypes.BIGQUERY } as never,
            athenaSecrets,
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
        athenaSecrets.secretAccessKey,
    );
});

it('does not cache temporary credentials', async () => {
    expect(
        (
            await resolver.resolve({
                ...selection(),
                stored: { ...athenaSecrets, sessionToken: 'temporary' },
            })
        ).cacheable,
    ).toBe(false);
});
it.each([
    AthenaAuthenticationType.IAM_ROLE,
    AthenaAuthenticationType.WEB_IDENTITY,
])('rejects slot method %s', async (authenticationType) => {
    await expect(
        resolver.resolve({
            ...selection(),
            stored: { ...athenaSecrets, authenticationType } as never,
        }),
    ).rejects.toThrow('complete');
});
