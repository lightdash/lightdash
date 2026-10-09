import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { AiServiceAccountSecrets } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../ConnectionContext';
import {
    credentialResolution,
    type CredentialSelection,
} from '../CredentialResolver';
import { CredentialResolverRegistry } from '../CredentialResolverRegistry';
import { BigqueryAiServiceAccountCredentialResolver } from './BigqueryAiServiceAccountCredentialResolver';
import { BigquerySsoCredentialResolver } from './BigquerySsoCredentialResolver';

const secrets: AiServiceAccountSecrets = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        client_email: 'agent@example.com',
        private_key: 'slot-key',
    },
};
const selection = (): CredentialSelection<
    CreateBigqueryCredentials,
    AiServiceAccountSecrets
> => ({
    connection: {
        type: WarehouseTypes.BIGQUERY,
        project: 'analytics',
        dataset: 'prod',
        authenticationType: BigqueryAuthenticationType.SSO,
        keyfileContents: { refresh_token: 'person-token' },
        location: undefined,
        priority: undefined,
        retries: undefined,
        maximumBytesBilled: undefined,
        timeoutSeconds: undefined,
    },
    stored: secrets,
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

it('uses the slot key and disables connection user credentials', () => {
    const connection = {
        ...selection().connection,
        allowUserCredentials: true,
        requireUserCredentials: true,
        keyfileContents: {
            type: 'service_account',
            client_email: 'connection@example.com',
            private_key: 'connection-key',
        },
    };
    const credentials =
        new BigqueryAiServiceAccountCredentialResolver().buildCredentials(
            connection,
            secrets,
        );

    expect(credentials).toMatchObject({
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        keyfileContents: secrets.keyfileContents,
        allowUserCredentials: false,
        requireUserCredentials: false,
    });
    expect(credentials.keyfileContents).toStrictEqual(secrets.keyfileContents);
    expect(credentials.keyfileContents).not.toEqual(connection.keyfileContents);
    expect(credentials.keyfileContents.private_key).toBe('slot-key');
});

it('selects the explicit AI mode before connection SSO and materializes only once', async () => {
    const registry = new CredentialResolverRegistry();
    const ai = new BigqueryAiServiceAccountCredentialResolver();
    const sso = new BigquerySsoCredentialResolver(
        () => lightdashConfigMock.auth.google,
        null,
    );
    const resolve = vi.spyOn(ai, 'resolve');
    const dispose = vi.spyOn(ai, 'dispose');
    const ssoResolve = vi.spyOn(sso, 'resolve');
    registry.register(WarehouseTypes.BIGQUERY, 'ai_service_account', ai);
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        sso,
    );
    const input = selection();
    const legacy = vi.fn(async () => input.connection);
    const result = await registry.resolveCredentialSelection(
        input,
        legacy,
        'ai_service_account',
    );
    expect(result).toMatchObject({
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        keyfileContents: secrets.keyfileContents,
    });
    expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
        'ai-service-account-v1',
        WarehouseTypes.BIGQUERY,
        'slot',
        'generation',
        'parent',
    ]);
    const again = await registry.resolveCredentialSelection(
        { ...input, connection: { ...result }, stored: result },
        legacy,
    );
    expect(again[credentialResolution]).toBe(result[credentialResolution]);
    expect(resolve).toHaveBeenCalledOnce();
    expect(ssoResolve).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    await result[credentialResolution]!.dispose();
    await again[credentialResolution]!.dispose();
    expect(dispose).toHaveBeenCalledOnce();
});

it.each([WarehouseTypes.BIGQUERY, WarehouseTypes.SNOWFLAKE])(
    'fails closed for unregistered AI mode on %s',
    async (type) => {
        const registry = new CredentialResolverRegistry();
        const input = {
            ...selection(),
            connection: {
                ...selection().connection,
                type,
            } as CreateWarehouseCredentials,
        };
        const legacy = vi.fn(async () => input.connection);
        await expect(
            registry.resolveCredentialSelection(
                input,
                legacy,
                'ai_service_account',
            ),
        ).rejects.toThrow('does not support');
        await expect(
            registry.validateOnSave(
                { ...input, intent: { kind: 'preserve' } },
                'ai_service_account',
            ),
        ).rejects.toThrow('does not support');
        expect(legacy).not.toHaveBeenCalled();
    },
);

it('validates complete slot secrets without retaining the connection key', async () => {
    const resolver = new BigqueryAiServiceAccountCredentialResolver();
    const input = selection();
    expect(
        await resolver.validateOnSave({
            ...input,
            intent: { kind: 'preserve' },
        }),
    ).toEqual({ connection: input.connection, stored: secrets });
    await Promise.all(
        [
            { ...secrets, authenticationType: BigqueryAuthenticationType.SSO },
            { ...secrets, type: WarehouseTypes.SNOWFLAKE },
            {
                ...secrets,
                keyfileContents: {
                    type: 'authorized_user',
                    refresh_token: 'person',
                },
            },
            {
                ...secrets,
                keyfileContents: {
                    type: 'service_account',
                    client_email: 'agent@example.com',
                },
            },
        ].map((stored) =>
            expect(
                resolver.validateOnSave({
                    ...input,
                    stored: stored as AiServiceAccountSecrets,
                    intent: { kind: 'preserve' },
                }),
            ).rejects.toThrow(),
        ),
    );
});

it.each([
    { kind: 'linkCurrentPerson', userUuid: 'person' },
    { kind: 'verifiedGoogleCallback', refreshToken: 'token' },
] as const)('rejects $kind save intent', async (intent) => {
    await expect(
        new BigqueryAiServiceAccountCredentialResolver().validateOnSave({
            ...selection(),
            intent,
        }),
    ).rejects.toThrow('service account');
});

it('separates slot, generation and source project but reuses identity across people', async () => {
    const resolver = new BigqueryAiServiceAccountCredentialResolver();
    const input = selection();
    const identity = resolver.cacheKeyIdentity(input);
    for (const change of [
        { uuid: 'other-slot' },
        { identityUuid: 'rotated' },
        { sourceProjectUuid: 'other-parent' },
    ]) {
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
        ).not.toEqual(identity);
    }
    expect(
        resolver.cacheKeyIdentity({
            ...input,
            context: connectionContextFromUser(
                { userUuid: 'other-person' },
                { organizationUuid: 'org', queryContext: null },
            ),
        }),
    ).toEqual(identity);
    expect((await resolver.resolve(input)).cacheable).toBe(true);
    expect((await resolver.resolve({ ...input, owner: null })).cacheable).toBe(
        false,
    );
    await expect(
        resolver.resolve({
            ...input,
            owner: { kind: 'project', uuid: 'project' },
        }),
    ).rejects.toThrow('owner');
});

it('rejects a parsed Databricks identity before constructing BigQuery credentials', () => {
    expect(() =>
        new BigqueryAiServiceAccountCredentialResolver().buildCredentials(
            selection().connection,
            {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'id',
                oauthClientSecret: 'secret',
            },
        ),
    ).toThrow('match the connection warehouse type');
});
