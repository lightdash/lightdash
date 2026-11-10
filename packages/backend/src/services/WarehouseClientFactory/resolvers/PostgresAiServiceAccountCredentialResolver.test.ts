import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    postgresConnection,
    postgresSecrets,
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
import { PostgresAiServiceAccountCredentialResolver } from './PostgresAiServiceAccountCredentialResolver';

const selection = (): CredentialSelection<
    CreatePostgresCredentials,
    AiServiceAccountSecrets
> => ({
    connection: postgresConnection,
    stored: postgresSecrets,
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
const resolver = new PostgresAiServiceAccountCredentialResolver();
it('validates preserve locally and rejects incorrect secret and connection discriminants', async () => {
    const input = selection();
    expect(
        await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: input.connection, stored: postgresSecrets });
    expect(() =>
        resolver.buildCredentials(
            { type: WarehouseTypes.BIGQUERY } as never,
            postgresSecrets,
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
        postgresSecrets.password,
    );
});

it('preserves routing and tunnel keys while replacing every connection identity field', async () => {
    const { clientCredentials, ...metadata } =
        await resolver.resolve(selection());
    expect(clientCredentials).toEqual({
        type: WarehouseTypes.POSTGRES,
        host: 'warehouse.internal',
        port: 5432,
        dbname: 'analytics',
        schema: 'reporting',
        sslmode: 'verify-full',
        sslrootcert: 'root-cert',
        useSshTunnel: true,
        sshTunnelHost: 'bastion.internal',
        sshTunnelPort: 22,
        sshTunnelUser: 'tunnel-user',
        sshTunnelPublicKey: 'tunnel-public',
        sshTunnelPrivateKey: 'tunnel-private',
        user: 'ai_agents',
        password: 'agent-password',
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
it('dispatches Postgres AI credentials without a legacy fallback', async () => {
    const registry = new CredentialResolverRegistry();
    registerAiServiceAccountCredentialResolvers(registry);
    const legacy = vi.fn();
    const result = await registry.resolveCredentialSelection(
        selection(),
        legacy,
        'ai_service_account',
    );
    expect(result).toMatchObject(postgresSecrets);
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.POSTGRES,
        'slot',
        'generation',
        'parent',
    ]);
    expect(legacy).not.toHaveBeenCalled();
});
