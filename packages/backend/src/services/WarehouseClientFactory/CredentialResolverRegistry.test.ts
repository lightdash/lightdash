import {
    BigqueryAuthenticationType,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { expectTypeOf } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
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
import { BigquerySsoCredentialResolver } from './resolvers/BigquerySsoCredentialResolver';

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
                cacheable: modeCacheable,
            });
            transport.resolve.mockResolvedValue({
                clientCredentials: {
                    ...selection.connection,
                    password: 'transport',
                },
                clientOptions: { maxOpenConnections: 3 },
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
            cacheable: true,
            cacheKeyIdentity: ['mode'],
        });
        await resolved[credentialResolution]!.dispose();
        expect(mode.dispose).toHaveBeenCalledOnce();
        expect(transport.resolve).not.toHaveBeenCalled();
        expect(transport.validateOnSave).not.toHaveBeenCalled();
    });
});
