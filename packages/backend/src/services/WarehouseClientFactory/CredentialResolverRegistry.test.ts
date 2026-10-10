import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { expectTypeOf } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { toDbtTarget } from '../../dbt/targets';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from './ConnectionContext';
import {
    credentialResolution,
    preparedCredentials,
    type CredentialResolver,
    type CredentialSelection,
    type PreparedCredentials,
} from './CredentialResolver';
import { CredentialResolverRegistry } from './CredentialResolverRegistry';
import { createCredentialResolverRegistry } from './credentialResolvers';
import { prepareWarehouseOAuthCredentials } from './preparedOAuthCredentials';
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';
import { DatabricksOAuthCredentialResolver } from './resolvers/DatabricksOAuthCredentialResolver';
import { SnowflakeOAuthCredentialResolver } from './resolvers/SnowflakeOAuthCredentialResolver';

it('rejects duplicate registrations', () => {
    const registry = new CredentialResolverRegistry();
    const resolver = new BigquerySsoCredentialResolver(
        () => lightdashConfigMock.auth.google,
        null,
    );
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        resolver,
    );
    expect(() =>
        registry.register(
            WarehouseTypes.BIGQUERY,
            BigqueryAuthenticationType.SSO,
            resolver,
        ),
    ).toThrow('already registered');
    expectTypeOf<CredentialResolver<CreateBigqueryCredentials>>().not.toExtend<
        CredentialResolver<CreateSnowflakeCredentials>
    >();
});

it.each([
    undefined,
    BigqueryAuthenticationType.PRIVATE_KEY,
    BigqueryAuthenticationType.ADC,
])('keeps %s outside the SSO resolver', async (authenticationType) => {
    const registry = new CredentialResolverRegistry();
    const resolver = new BigquerySsoCredentialResolver(
        () => lightdashConfigMock.auth.google,
        null,
    );
    const resolve = vi.spyOn(resolver, 'resolve');
    registry.register(
        WarehouseTypes.BIGQUERY,
        BigqueryAuthenticationType.SSO,
        resolver,
    );
    const credentials: CreateBigqueryCredentials = {
        type: WarehouseTypes.BIGQUERY,
        authenticationType,
        project: 'analytics',
        dataset: 'prod',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'cli-id',
            client_secret: 'cli-secret',
            refresh_token: 'cli-refresh',
        },
    };
    const selection: CredentialSelection<CreateBigqueryCredentials> = {
        connection: credentials,
        stored: credentials,
        owner: null,
        context: connectionContextFromUser(
            { userUuid: 'user' },
            { organizationUuid: 'org', queryContext: null },
        ),
        projectUuid: null,
        warehouseConnectionUuid: null,
        credentialKind: WarehouseCredentialKind.SHARED,
        aiPlan: null,
    };
    const legacy = vi.fn(async () => credentials);
    expect(await registry.resolveCredentialSelection(selection, legacy)).toBe(
        credentials,
    );
    expect(legacy).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
});

const transportFixture = () => {
    const connection: CreateRedshiftCredentials = {
        type: WarehouseTypes.REDSHIFT,
        authenticationType: RedshiftAuthenticationType.PASSWORD,
        host: 'db',
        port: 5439,
        user: 'user',
        password: 'password',
        dbname: 'db',
        schema: 'public',
        useSshTunnel: true,
    };
    const selection: CredentialSelection<CreateRedshiftCredentials> = {
        connection,
        stored: { ...connection },
        owner: null,
        context: connectionContextFromUser(
            { userUuid: 'user' },
            { organizationUuid: 'org', queryContext: null },
        ),
        projectUuid: null,
        warehouseConnectionUuid: null,
        credentialKind: WarehouseCredentialKind.SHARED,
        aiPlan: null,
    };
    const makeResolver = (name: string) => ({
        resolve: vi
            .fn<CredentialResolver<CreateRedshiftCredentials>['resolve']>()
            .mockImplementation(async (input) => ({
                clientCredentials: { ...input.connection, password: name },
                clientOptions: { maxOpenConnections: name === 'mode' ? 2 : 3 },
                agentSignIn: null,
                cacheable: true,
            })),
        validateOnSave: vi
            .fn<
                CredentialResolver<CreateRedshiftCredentials>['validateOnSave']
            >()
            .mockImplementation(async (input) => ({
                connection: { ...input.connection, password: name },
                stored: { ...input.stored, password: name },
            })),
        cacheKeyIdentity: vi.fn(() => [name]),
        toDbtTarget: vi.fn<
            CredentialResolver<CreateRedshiftCredentials>['toDbtTarget']
        >((_resolved, finalConnection, policy) =>
            toDbtTarget(finalConnection, policy),
        ),
        dispose: vi.fn(async () => {}),
    });
    const registry = new CredentialResolverRegistry();
    const mode = makeResolver('mode');
    const transport = makeResolver('transport');
    const legacy = vi.fn<() => Promise<CreateRedshiftCredentials>>(
        async () => ({ ...connection, password: 'legacy' }),
    );
    const registerMode = () =>
        registry.register(
            WarehouseTypes.REDSHIFT,
            RedshiftAuthenticationType.PASSWORD,
            mode,
        );
    registry.registerTransport(
        (c): c is CreateRedshiftCredentials =>
            c.type === WarehouseTypes.REDSHIFT && c.useSshTunnel === true,
        transport,
    );
    return { registry, selection, mode, transport, legacy, registerMode };
};

describe('transport composition', () => {
    it('skips the mode resolver for prepared credentials but still runs the transport', async () => {
        const { registry, selection, mode, transport, legacy, registerMode } =
            transportFixture();
        registerMode();
        const resolved = await registry.resolveCredentialSelection(
            {
                ...selection,
                connection: {
                    ...selection.connection,
                    [preparedCredentials]: true,
                } as PreparedCredentials as CreateRedshiftCredentials,
            },
            legacy,
        );
        expect(mode.resolve).not.toHaveBeenCalled();
        expect(legacy).not.toHaveBeenCalled();
        expect(transport.resolve).toHaveBeenCalledOnce();
        expect(
            Object.getOwnPropertySymbols(
                transport.resolve.mock.calls[0][0].connection,
            ),
        ).toEqual([]);
        expect(resolved).toMatchObject({ password: 'transport' });
    });

    it('applies transport once to an identity resolved by another registry and preserves disposal', async () => {
        const { registry, selection, mode, transport, legacy, registerMode } =
            transportFixture();
        const identityRegistry = new CredentialResolverRegistry();
        identityRegistry.register(
            WarehouseTypes.REDSHIFT,
            'ai_service_account',
            mode,
        );
        registerMode();
        const identity = await identityRegistry.resolveCredentialSelection(
            selection,
            legacy,
            'ai_service_account',
        );
        const resolved = await registry.resolveCredentialSelection(
            { ...selection, connection: identity },
            legacy,
        );
        expect(mode.resolve).toHaveBeenCalledOnce();
        expect(transport.resolve).toHaveBeenCalledOnce();
        expect(legacy).not.toHaveBeenCalled();
        expect(resolved[credentialResolution]?.cacheKeyIdentity).toEqual([
            'mode',
            'transport',
        ]);
        expect(
            await registry.resolveCredentialSelection(
                { ...selection, connection: resolved },
                legacy,
            ),
        ).toBe(resolved);
        expect(transport.resolve).toHaveBeenCalledOnce();
        await resolved[credentialResolution]?.dispose();
        await resolved[credentialResolution]?.dispose();
        expect(mode.dispose).toHaveBeenCalledOnce();
        expect(transport.dispose).toHaveBeenCalledOnce();
    });
    it('runs a transport after legacy resolution and preserves stored input', async () => {
        const { registry, selection, transport, legacy } = transportFixture();
        const resolved = await registry.resolveCredentialSelection(
            selection,
            legacy,
        );
        expect(legacy).toHaveBeenCalledOnce();
        expect(transport.resolve).toHaveBeenCalledWith({
            ...selection,
            connection: { ...selection.connection, password: 'legacy' },
        });
        expect(transport.resolve.mock.calls[0][0].stored).toBe(
            selection.stored,
        );
        expect(resolved).toMatchObject({ password: 'transport' });
        expect(resolved[credentialResolution]).toMatchObject({
            agentSignIn: null,
            cacheable: true,
            cacheKeyIdentity: ['transport'],
            clientOptions: { maxOpenConnections: 3 },
        });
    });
    it.each([
        [true, true],
        [false, true],
        [true, false],
        [false, false],
    ])(
        'combines options, identity and cacheability %s/%s',
        async (modeCacheable, transportCacheable) => {
            const {
                registry,
                selection,
                mode,
                transport,
                legacy,
                registerMode,
            } = transportFixture();
            registerMode();
            mode.resolve.mockResolvedValue({
                clientCredentials: {
                    ...selection.connection,
                    password: 'mode',
                },
                clientOptions: { maxOpenConnections: 2, agentSession: true },
                agentSignIn: null,
                cacheable: modeCacheable,
            });
            transport.resolve.mockResolvedValue({
                clientCredentials: {
                    ...selection.connection,
                    password: 'transport',
                },
                clientOptions: { maxOpenConnections: 3 },
                agentSignIn: null,
                cacheable: transportCacheable,
            });
            const resolved = await registry.resolveCredentialSelection(
                selection,
                legacy,
            );
            expect(legacy).not.toHaveBeenCalled();
            expect(transport.resolve.mock.calls[0][0].connection).toEqual({
                ...selection.connection,
                password: 'mode',
            });
            expect(
                Object.getOwnPropertySymbols(
                    transport.resolve.mock.calls[0][0].connection,
                ),
            ).toEqual([]);
            expect(resolved[credentialResolution]).toMatchObject({
                cacheable: modeCacheable && transportCacheable,
                cacheKeyIdentity: ['mode', 'transport'],
                clientOptions: { maxOpenConnections: 3, agentSession: true },
            });
            expect(
                await registry.resolveCredentialSelection(
                    { ...selection, connection: resolved },
                    legacy,
                ),
            ).toBe(resolved);
            expect(transport.resolve).toHaveBeenCalledOnce();
        },
    );
    it.each([false, true])(
        'disposes in reverse order once when transport throws: %s',
        async (throws) => {
            const {
                registry,
                selection,
                mode,
                transport,
                legacy,
                registerMode,
            } = transportFixture();
            registerMode();
            const order: string[] = [];
            transport.dispose.mockImplementation(async () => {
                order.push('transport');
                if (throws) throw new Error('dispose failed');
            });
            mode.dispose.mockImplementation(async () => {
                order.push('mode');
            });
            const resolved = await registry.resolveCredentialSelection(
                selection,
                legacy,
            );
            const disposal = resolved[credentialResolution]!.dispose();
            expect(resolved[credentialResolution]!.dispose()).toBe(disposal);
            if (throws)
                await expect(disposal).rejects.toThrow('dispose failed');
            else await disposal;
            expect(order).toEqual(['transport', 'mode']);
        },
    );
    it('validates mode then transport using both mode outputs', async () => {
        const { registry, selection, mode, transport, registerMode } =
            transportFixture();
        registerMode();
        const input = { ...selection, intent: { kind: 'preserve' as const } };
        const validated = await registry.validateOnSave(input);
        expect(mode.validateOnSave).toHaveBeenCalledWith(input);
        expect(transport.validateOnSave).toHaveBeenCalledWith({
            ...input,
            connection: { ...input.connection, password: 'mode' },
            stored: { ...input.stored, password: 'mode' },
        });
        expect(validated.connection).toMatchObject({ password: 'transport' });
        expect(validated.stored).toMatchObject({ password: 'transport' });
    });
    it('validates transport without a mode', async () => {
        const { registry, selection, transport } = transportFixture();
        const input = { ...selection, intent: { kind: 'preserve' as const } };
        await registry.validateOnSave(input);
        expect(transport.validateOnSave).toHaveBeenCalledWith(input);
    });
    it('preserves the no-match and mode-only paths and detects either resolver', async () => {
        const { registry, selection, transport, mode, legacy, registerMode } =
            transportFixture();
        expect(registry.has(selection.connection)).toBe(true);
        const connection = { ...selection.connection, useSshTunnel: false };
        expect(registry.has(connection)).toBe(false);
        legacy.mockResolvedValue(connection);
        expect(
            await registry.resolveCredentialSelection(
                { ...selection, connection },
                legacy,
            ),
        ).toBe(connection);
        expect(
            await registry.validateOnSave({
                ...selection,
                connection,
                intent: { kind: 'preserve' },
            }),
        ).toEqual({ connection, stored: selection.stored });
        registerMode();
        expect(registry.has(connection)).toBe(true);
        const resolved = await registry.resolveCredentialSelection(
            { ...selection, connection },
            legacy,
        );
        expect(resolved[credentialResolution]).toMatchObject({
            clientOptions: { maxOpenConnections: 2 },
            agentSignIn: null,
            cacheable: true,
            cacheKeyIdentity: ['mode'],
        });
        await resolved[credentialResolution]!.dispose();
        expect(mode.dispose).toHaveBeenCalledOnce();
        expect(transport.resolve).not.toHaveBeenCalled();
        expect(transport.validateOnSave).not.toHaveBeenCalled();
    });
});

it.each([
    DatabricksAuthenticationType.OAUTH_U2M,
    DatabricksAuthenticationType.OAUTH_M2M,
])(
    'registers Databricks %s and skips a prepared second exchange',
    async (authenticationType) => {
        const resolver = new DatabricksOAuthCredentialResolver({
            lightdashConfig: lightdashConfigMock,
        } as never);
        const resolve = vi
            .spyOn(resolver, 'resolve')
            .mockImplementation(async (input) => ({
                clientCredentials: { ...input.connection, token: 'fresh' },
                clientOptions: {},
                agentSignIn: null,
                cacheable: true,
            }));
        const registry = createCredentialResolverRegistry({
            lightdashConfig: lightdashConfigMock,
            userOAuthGrantsModel: { getRefreshToken: vi.fn() },
            sshKeyPairModel: { find: vi.fn() },
            snowflakeOAuthCredentialResolver:
                new SnowflakeOAuthCredentialResolver({} as never),
            databricksOAuthCredentialResolver: resolver,
        });
        const connection: CreateDatabricksCredentials = {
            type: WarehouseTypes.DATABRICKS,
            authenticationType,
            serverHostName: 'workspace.example.com',
            database: 'schema',
            httpPath: '/sql/warehouse',
            token: 'old',
            refreshToken: 'refresh-secret',
            oauthClientId: 'client',
            oauthClientSecret: 'client-secret',
        };
        const input: CredentialSelection<CreateDatabricksCredentials> = {
            connection,
            stored: connection,
            owner: { kind: 'project', uuid: 'project' },
            context: connectionContextFromUser(
                { userUuid: 'user' },
                { organizationUuid: 'org', queryContext: null },
            ),
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            credentialKind: WarehouseCredentialKind.SHARED,
            aiPlan: null,
        };
        const legacy = vi.fn();
        expect(registry.has(connection)).toBe(true);
        expect(
            registry.has({
                ...connection,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            }),
        ).toBe(false);
        const result = await registry.resolveCredentialSelection(input, legacy);
        expect(result).toMatchObject({ token: 'fresh' });
        expect(result[credentialResolution]?.cacheKeyIdentity).toEqual([
            'databricks-oauth',
            authenticationType,
            'workspace.example.com',
            'client',
            'project',
            'project',
            null,
        ]);
        const prepared = prepareWarehouseOAuthCredentials({
            ...connection,
            token: 'prepared',
        });
        const again = await registry.resolveCredentialSelection(
            { ...input, connection: { ...prepared } },
            legacy,
        );
        expect(again).toMatchObject({ token: 'prepared' });
        expect(resolve).toHaveBeenCalledOnce();
        expect(legacy).not.toHaveBeenCalled();
    },
);

describe('dbt target resolution', () => {
    it('keeps the mode converter through transport and applies final tunnel and source locations without refreshing', async () => {
        const { registry, selection, mode, transport, legacy, registerMode } =
            transportFixture();
        registerMode();
        const resolved = await registry.resolveCredentialSelection(
            selection,
            legacy,
        );
        if (resolved.type !== WarehouseTypes.REDSHIFT)
            throw new Error('Expected Redshift');
        const finalConnection = {
            ...resolved,
            host: '127.0.0.1',
            port: 43123,
            dbname: 'source_database',
            schema: 'source_schema',
        };
        const policy = { explicitCredentials: true };
        expect(registry.toDbtTarget(resolved, finalConnection, policy)).toEqual(
            toDbtTarget(finalConnection, policy),
        );
        expect(mode.toDbtTarget).toHaveBeenCalledExactlyOnceWith(
            await mode.resolve.mock.results[0].value,
            finalConnection,
            policy,
        );
        expect(transport.toDbtTarget).not.toHaveBeenCalled();
        expect(mode.resolve).toHaveBeenCalledOnce();
        expect(transport.resolve).toHaveBeenCalledOnce();
        expect(legacy).not.toHaveBeenCalled();
        await resolved[credentialResolution]!.dispose();
    });

    it('preserves a mode refusal through transport', async () => {
        const { registry, selection, mode, transport, legacy, registerMode } =
            transportFixture();
        registerMode();
        const refusal = {
            kind: 'none' as const,
            reason: 'This mode cannot run dbt.',
        };
        mode.toDbtTarget.mockReturnValue(refusal);
        const resolved = await registry.resolveCredentialSelection(
            selection,
            legacy,
        );
        expect(
            registry.toDbtTarget(resolved, resolved, {
                explicitCredentials: true,
            }),
        ).toEqual(refusal);
        expect(transport.toDbtTarget).not.toHaveBeenCalled();
        await resolved[credentialResolution]!.dispose();
    });

    it('converts prepared and legacy static credentials using the final source location', async () => {
        const { selection } = transportFixture();
        const registry = new CredentialResolverRegistry();
        const legacy = vi.fn(async () => selection.connection);
        const resolved = await registry.resolveCredentialSelection(
            selection,
            legacy,
        );
        if (resolved.type !== WarehouseTypes.REDSHIFT)
            throw new Error('Expected Redshift');
        const finalConnection = {
            ...resolved,
            dbname: 'source_database',
            schema: 'source_schema',
        };
        const policy = { explicitCredentials: false };
        expect(registry.toDbtTarget(resolved, finalConnection, policy)).toEqual(
            toDbtTarget(finalConnection, policy),
        );
        const preparedConnection: PreparedCredentials = {
            ...resolved,
            [preparedCredentials]: true,
        };
        const prepared = await registry.resolveCredentialSelection(
            { ...selection, connection: preparedConnection },
            legacy,
        );
        expect(registry.toDbtTarget(prepared, finalConnection, policy)).toEqual(
            toDbtTarget(finalConnection, policy),
        );
        expect(legacy).toHaveBeenCalledOnce();
    });
});
