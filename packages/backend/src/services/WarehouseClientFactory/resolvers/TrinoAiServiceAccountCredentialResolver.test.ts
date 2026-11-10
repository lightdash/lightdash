import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateTrinoCredentials,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    trinoConnection,
    trinoSecrets,
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
import { TrinoAiServiceAccountCredentialResolver } from './TrinoAiServiceAccountCredentialResolver';

const selection = (): CredentialSelection<
    CreateTrinoCredentials,
    AiServiceAccountSecrets
> => ({
    connection: trinoConnection,
    stored: trinoSecrets,
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
const resolver = new TrinoAiServiceAccountCredentialResolver();
it('refuses to build a dbt target from AI service account credentials', () => {
    expect(resolver.toDbtTarget()).toEqual({
        kind: 'none',
        reason: "Shared agent account credentials cannot run dbt. Use the connection's key or a person's sign-in instead.",
    });
});
it('validates preserve locally and rejects incorrect secret and connection discriminants', async () => {
    const input = selection();
    expect(
        await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: input.connection, stored: trinoSecrets });
    expect(() =>
        resolver.buildCredentials(
            { type: WarehouseTypes.BIGQUERY } as never,
            trinoSecrets,
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
        trinoSecrets.password,
    );
});

it('preserves all routing fields while replacing every connection identity field', async () => {
    const { clientCredentials, ...metadata } =
        await resolver.resolve(selection());
    expect(clientCredentials).toEqual({
        ...trinoConnection,
        ...trinoSecrets,
        requireUserCredentials: false,
    });
    expect(metadata).toEqual({
        clientOptions: {},
        cacheable: true,
        agentSignIn: null,
    });
    expect(JSON.stringify(clientCredentials)).not.toMatch(
        /project-user|project-password|project-role|project-cert|project-key/,
    );
});
it('dispatches Trino AI credentials without a legacy fallback', async () => {
    const registry = new CredentialResolverRegistry();
    registerAiServiceAccountCredentialResolvers(registry);
    const legacy = vi.fn();
    const result = await registry.resolveCredentialSelection(
        selection(),
        legacy,
        'ai_service_account',
    );
    expect(result).toMatchObject(trinoSecrets);
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.TRINO,
        'slot',
        'generation',
        'parent',
    ]);
    expect(legacy).not.toHaveBeenCalled();
});

it.each([false, true])(
    'preserves the AI service account dbt refusal with explicit credentials %s',
    async (explicitCredentials) => {
        const registry = new CredentialResolverRegistry();
        registerAiServiceAccountCredentialResolvers(registry);
        const legacy = vi.fn();
        const result = await registry.resolveCredentialSelection(
            selection(),
            legacy,
            'ai_service_account',
        );
        expect(
            registry.toDbtTarget(result, result, { explicitCredentials }),
        ).toEqual({
            kind: 'none',
            reason: "Shared agent account credentials cannot run dbt. Use the connection's key or a person's sign-in instead.",
        });
        expect(legacy).not.toHaveBeenCalled();
    },
);

it.each(['', '  '])('refuses a blank host %j', (host) => {
    expect(() =>
        resolver.buildCredentials({ ...trinoConnection, host }, trinoSecrets),
    ).toThrow('Set the Trino host before adding a shared agent account.');
});
