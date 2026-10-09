import {
    DatabricksAuthenticationType,
    DatabricksTokenError,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateDatabricksCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import * as warehouses from '@lightdash/warehouses';
import * as deadline from '../../auth/databricksOAuthRefresh';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { createDatabase } from '../../models/RefreshTokenRotation/fakeKnex.mock';
import {
    RefreshTokenRotation,
    RefreshTokenSourceChangedError,
} from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import {
    preparedCredentials,
    type MaterializedCredentials,
    type PreparedCredentials,
} from '../WarehouseClientFactory/CredentialResolver';
import type { CredentialResolverRegistry } from '../WarehouseClientFactory/CredentialResolverRegistry';
import type {
    WarehouseCredentialBase,
    WarehouseCredentialResolutionContext,
} from '../WarehouseClientFactory/WarehouseCredentialSource';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import { projectWithSensitiveFields } from './ProjectService.mock';

const credentials: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
    serverHostName: 'workspace.example.com',
    httpPath: '/sql/warehouse',
    catalog: 'catalog',
    database: 'schema',
    token: 'stale-access',
    refreshToken: 'stored-refresh',
    oauthClientId: 'cli-client',
};
const actor = { userUuid: 'person', organizationUuid: 'org' };
const setup = (
    enabled: boolean,
    mode = DatabricksAuthenticationType.OAUTH_U2M,
    organizationCredentialUuid: string | null = null,
) => {
    const connection: CreateDatabricksCredentials = {
        ...credentials,
        authenticationType: mode,
    };
    const { database, raw } = createDatabase();
    const rotation = new RefreshTokenRotation({ database });
    const run = vi.spyOn(rotation, 'run');
    const project = {
        ...projectWithSensitiveFields,
        projectUuid: 'project',
        organizationUuid: 'org',
        organizationWarehouseCredentialsUuid: organizationCredentialUuid,
        warehouseConnection: connection,
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue(project),
        getOwnWarehouseCredentialsForProject: vi
            .fn()
            .mockResolvedValue(connection),
        rotateRefreshToken: vi.fn().mockResolvedValue(true),
    };
    const organizationWarehouseCredentialsModel = {
        getByUuidWithSensitiveData: vi.fn().mockResolvedValue({
            organizationUuid: 'org',
            credentials: connection,
        }),
        rotateRefreshToken: vi.fn().mockResolvedValue(true),
    };
    const userWarehouseCredentialsModel = {
        findForProjectWithSecrets: vi.fn().mockResolvedValue(null),
        findDatabricksOauthU2mForHostWithSecrets: vi.fn().mockResolvedValue({
            uuid: 'user-row',
            credentials: { ...connection, refreshToken: 'person-refresh' },
        }),
        getByUuidWithSecrets: vi.fn().mockResolvedValue({
            uuid: 'user-row',
            credentials: { ...connection, refreshToken: 'person-refresh' },
        }),
        rotateRefreshToken: vi.fn().mockResolvedValue(true),
    };
    const service = new ProjectService({
        lightdashConfig: lightdashConfigMock,
        refreshTokenRotation: rotation,
        projectModel,
        organizationWarehouseCredentialsModel,
        userWarehouseCredentialsModel,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
    } as unknown as ProjectServiceArguments);
    const probe = service as unknown as {
        _resolveWarehouseClientCredentials: (
            input: { warehouseConnection: CreateDatabricksCredentials },
            userUuid: string,
            organizationUuid: string,
        ) => Promise<{ warehouseConnection: MaterializedCredentials }>;
        finishSingleRouteCredentials: (
            base: Extract<WarehouseCredentialBase, { kind: 'original' }>,
            context: WarehouseCredentialResolutionContext,
        ) => Promise<MaterializedCredentials>;
        finishCompileCredentials: (
            base: Exclude<WarehouseCredentialBase, { kind: 'final' }>,
            context: WarehouseCredentialResolutionContext,
        ) => Promise<MaterializedCredentials>;
        prepareLegacyCompileCredentials: (
            input: typeof project,
            user: typeof actor,
        ) => Promise<MaterializedCredentials>;
        refreshCredentialsAndPersistRotation: (
            input: CreateDatabricksCredentials,
            userUuid: string,
            source:
                | { kind: 'project'; projectUuid: string }
                | {
                      kind: 'organization';
                      organizationWarehouseCredentialsUuid: string;
                  },
        ) => Promise<CreateWarehouseCredentials>;
        warehouseClientFactory: {
            credentialResolvers: CredentialResolverRegistry;
        };
        repairStalePreviewSsoCredentials: (
            projectUuid: string,
            connection: CreateWarehouseCredentials,
        ) => Promise<CreateWarehouseCredentials>;
    };
    vi.spyOn(probe, 'repairStalePreviewSsoCredentials').mockImplementation(
        async (_uuid, value) => value,
    );
    const result = {
        accessToken: 'fresh-access',
        expiresIn: 3600,
        refreshToken: 'rotated-refresh',
    };
    const exchange = vi
        .spyOn(warehouses, 'refreshDatabricksOAuthToken')
        .mockResolvedValue(result);
    const lockedExchange = vi
        .spyOn(deadline, 'refreshDatabricksOAuthTokenWithDeadline')
        .mockResolvedValue(result);
    const clientExchange = vi
        .spyOn(warehouses, 'exchangeDatabricksOAuthCredentials')
        .mockResolvedValue(result);
    return {
        probe,
        project,
        projectModel,
        organizationWarehouseCredentialsModel,
        userWarehouseCredentialsModel,
        exchange,
        lockedExchange,
        clientExchange,
        run,
        raw,
    };
};
afterEach(() => vi.restoreAllMocks());

describe.each([
    DatabricksAuthenticationType.OAUTH_U2M,
    DatabricksAuthenticationType.OAUTH_M2M,
])('ProjectService Databricks %s resolver entry points', (mode) => {
    test.each([true, false])(
        'direct refresh uses the resolver with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            const result = await f.probe.refreshCredentialsAndPersistRotation(
                f.project.warehouseConnection,
                actor.userUuid,
                { kind: 'project', projectUuid: 'project' },
            );
            expect(result).toMatchObject({
                token: 'fresh-access',
                refreshToken: 'rotated-refresh',
                authenticationType: mode,
            });
            expect(f.run).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(
                enabled ? f.lockedExchange : f.exchange,
            ).toHaveBeenCalledExactlyOnceWith(
                credentials.serverHostName,
                'cli-client',
                'stored-refresh',
                undefined,
            );
            expect(
                f.projectModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'project',
                'stored-refresh',
                'rotated-refresh',
                ...(enabled ? [{ raw: f.raw }] : []),
            );
        },
    );

    test.each([true, false])(
        'direct organization refresh writes the source row with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode, 'org-row');
            await f.probe.refreshCredentialsAndPersistRotation(
                f.project.warehouseConnection,
                actor.userUuid,
                {
                    kind: 'organization',
                    organizationWarehouseCredentialsUuid: 'org-row',
                },
            );
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'org-row',
                'stored-refresh',
                'rotated-refresh',
                ...(enabled ? [{ raw: f.raw }] : []),
            );
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'legacy compile writes organization rotation only with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode, 'org-row');
            const result = await f.probe.prepareLegacyCompileCredentials(
                f.project,
                actor,
            );
            expect(result).toMatchObject({
                token: 'fresh-access',
                refreshToken: 'rotated-refresh',
            });
            expect((result as PreparedCredentials)[preparedCredentials]).toBe(
                true,
            );
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
            if (enabled)
                expect(
                    f.organizationWarehouseCredentialsModel.rotateRefreshToken,
                ).toHaveBeenCalledWith(
                    'org-row',
                    'stored-refresh',
                    'rotated-refresh',
                    { raw: f.raw },
                );
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'legacy compile preserves raw errors with lock %s',
        async (enabled) => {
            const f = setup(enabled, mode);
            const error = new Error('invalid_grant');
            (enabled ? f.lockedExchange : f.exchange).mockRejectedValue(error);
            await expect(
                f.probe.prepareLegacyCompileCredentials(f.project, actor),
            ).rejects.toBe(error);
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test.each(['save', 'legacy compile', 'legacy token only'] as const)(
        '%s prepares credentials without a second exchange',
        async (entry) => {
            const f = setup(true, mode);
            if (entry === 'legacy token only')
                f.project.warehouseConnection.refreshToken = undefined;
            const prepared =
                entry === 'save'
                    ? (
                          await f.probe._resolveWarehouseClientCredentials(
                              {
                                  warehouseConnection:
                                      f.project.warehouseConnection,
                              },
                              actor.userUuid,
                              actor.organizationUuid,
                          )
                      ).warehouseConnection
                    : await f.probe.prepareLegacyCompileCredentials(
                          f.project,
                          actor,
                      );
            const resolved =
                await f.probe.warehouseClientFactory.credentialResolvers.resolveCredentialSelection(
                    {
                        connection: { ...prepared },
                        stored: prepared,
                        owner: { kind: 'project', uuid: 'project' },
                        context: connectionContextFromUser(actor, {
                            organizationUuid: 'org',
                            queryContext: null,
                        }),
                        projectUuid: 'project',
                        warehouseConnectionUuid: null,
                        aiPlan: null,
                        credentialKind: WarehouseCredentialKind.SHARED,
                    },
                    vi.fn(),
                );
            expect(resolved).toMatchObject({
                token:
                    entry === 'legacy token only'
                        ? 'stale-access'
                        : 'fresh-access',
            });
            expect(
                f.exchange.mock.calls.length +
                    f.lockedExchange.mock.calls.length,
            ).toBe(entry === 'legacy token only' ? 0 : 1);
            if (entry === 'save') {
                expect(resolved).toMatchObject({
                    refreshToken:
                        mode === DatabricksAuthenticationType.OAUTH_U2M
                            ? 'stored-refresh'
                            : 'rotated-refresh',
                });
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            }
        },
    );
});

test.each([true, false])(
    'legacy U2M compile uses and rotates the personal source with lock %s',
    async (enabled) => {
        const f = setup(enabled);
        f.project.warehouseConnection.refreshToken = undefined;
        const personal = {
            uuid: 'user-row',
            credentials: {
                ...credentials,
                refreshToken: 'person-refresh',
                oauthClientId: 'person-client',
            },
        };
        f.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
            personal,
        );
        f.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
            personal,
        );
        const result = await f.probe.prepareLegacyCompileCredentials(
            f.project,
            actor,
        );
        expect(result).toMatchObject({
            token: 'fresh-access',
            refreshToken: 'rotated-refresh',
            oauthClientId: 'cli-client',
        });
        expect(
            enabled ? f.lockedExchange : f.exchange,
        ).toHaveBeenCalledExactlyOnceWith(
            credentials.serverHostName,
            'person-client',
            'person-refresh',
            undefined,
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        expect(
            f.userWarehouseCredentialsModel.rotateRefreshToken,
        ).toHaveBeenCalledTimes(enabled ? 1 : 0);
        if (enabled) {
            expect(f.run.mock.calls[0][0].key).toEqual({
                kind: 'user',
                uuid: 'user-row',
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            });
            expect(
                f.userWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'user-row',
                'person-refresh',
                'rotated-refresh',
                undefined,
                { raw: f.raw },
            );
        }
    },
);

test('U2M save loads host-matching credentials and retains their original token', async () => {
    const f = setup(true);
    f.project.warehouseConnection.refreshToken = undefined;
    const result = await f.probe._resolveWarehouseClientCredentials(
        { warehouseConnection: f.project.warehouseConnection },
        actor.userUuid,
        actor.organizationUuid,
    );
    expect(result.warehouseConnection).toMatchObject({
        token: 'fresh-access',
        refreshToken: 'person-refresh',
    });
    expect(
        f.userWarehouseCredentialsModel
            .findDatabricksOauthU2mForHostWithSecrets,
    ).toHaveBeenCalledExactlyOnceWith('person', credentials.serverHostName);
    expect(f.run).not.toHaveBeenCalled();
});

test('U2M save retains the reconnect error', async () => {
    const f = setup(true);
    f.exchange.mockRejectedValue(new Error('invalid_grant'));
    await expect(
        f.probe._resolveWarehouseClientCredentials(
            { warehouseConnection: f.project.warehouseConnection },
            actor.userUuid,
            actor.organizationUuid,
        ),
    ).rejects.toBeInstanceOf(DatabricksTokenError);
});

test('M2M legacy compile with client credentials stays unlocked', async () => {
    const f = setup(true, DatabricksAuthenticationType.OAUTH_M2M);
    f.project.warehouseConnection = {
        ...f.project.warehouseConnection,
        refreshToken: undefined,
        oauthClientSecret: 'cli-secret',
    };
    const result = await f.probe.prepareLegacyCompileCredentials(
        f.project,
        actor,
    );
    expect(result).toMatchObject({
        token: 'fresh-access',
        refreshToken: 'rotated-refresh',
    });
    expect(f.clientExchange).toHaveBeenCalledExactlyOnceWith(
        credentials.serverHostName,
        'cli-client',
        'cli-secret',
    );
    expect(f.run).not.toHaveBeenCalled();
});

describe.each(['query', 'compile', 'legacy compile'] as const)(
    '%s sparse personal U2M credentials',
    (entry) => {
        const resolve = (f: ReturnType<typeof setup>) =>
            entry === 'legacy compile'
                ? f.probe.prepareLegacyCompileCredentials(f.project, actor)
                : f.probe[
                      entry === 'compile'
                          ? 'finishCompileCredentials'
                          : 'finishSingleRouteCredentials'
                  ](
                      {
                          kind: 'original',
                          projectUuid: 'project',
                          organizationUuid: 'org',
                          organizationWarehouseCredentialsUuid: null,
                          warehouseConnectionUuid: null,
                          connectionRoute: null,
                          credentials: {
                              ...f.project.warehouseConnection,
                              requireUserCredentials: true,
                          },
                      },
                      connectionContextFromUser(actor, {
                          organizationUuid: 'org',
                          queryContext: null,
                      }),
                  );

        test.each(
            [true, false].flatMap((enabled) =>
                ['host', 'client', 'both'].map((missing) => ({
                    enabled,
                    missing,
                })),
            ),
        )(
            'inherits missing $missing with lock $enabled',
            async ({ enabled, missing }) => {
                const f = setup(enabled);
                f.project.warehouseConnection.refreshToken = undefined;
                const personal = {
                    uuid: 'user-row',
                    credentials: {
                        type: WarehouseTypes.DATABRICKS,
                        authenticationType:
                            DatabricksAuthenticationType.OAUTH_U2M,
                        refreshToken: 'person-refresh',
                        ...(missing === 'client'
                            ? { serverHostName: credentials.serverHostName }
                            : {}),
                        ...(missing === 'host'
                            ? { oauthClientId: 'person-client' }
                            : {}),
                    },
                };
                f.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
                    personal,
                );
                f.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
                    personal,
                );
                const result = await resolve(f);
                expect(result).toMatchObject({
                    token: 'fresh-access',
                    refreshToken: 'rotated-refresh',
                });
                expect(
                    enabled ? f.lockedExchange : f.exchange,
                ).toHaveBeenCalledExactlyOnceWith(
                    credentials.serverHostName,
                    missing === 'host' ? 'person-client' : 'cli-client',
                    'person-refresh',
                    undefined,
                );
                expect(
                    f.userWarehouseCredentialsModel.rotateRefreshToken,
                ).toHaveBeenCalledTimes(
                    enabled || entry !== 'legacy compile' ? 1 : 0,
                );
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            },
        );

        test.each(['host', 'client', 'mode'] as const)(
            'rejects a real personal %s replacement',
            async (field) => {
                const f = setup(true);
                f.project.warehouseConnection.refreshToken = undefined;
                const personal = {
                    uuid: 'user-row',
                    credentials: {
                        type: WarehouseTypes.DATABRICKS,
                        authenticationType:
                            DatabricksAuthenticationType.OAUTH_U2M,
                        refreshToken: 'person-refresh',
                    },
                };
                f.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
                    personal,
                );
                f.userWarehouseCredentialsModel.getByUuidWithSecrets.mockResolvedValue(
                    {
                        ...personal,
                        credentials: {
                            ...personal.credentials,
                            ...(field === 'host'
                                ? { serverHostName: 'replacement.example.com' }
                                : {}),
                            ...(field === 'client'
                                ? { oauthClientId: 'replacement-client' }
                                : {}),
                            ...(field === 'mode'
                                ? {
                                      authenticationType:
                                          DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                                  }
                                : {}),
                        },
                    },
                );
                await expect(resolve(f)).rejects.toBeInstanceOf(
                    RefreshTokenSourceChangedError,
                );
                expect(f.lockedExchange).not.toHaveBeenCalled();
                expect(
                    f.userWarehouseCredentialsModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            },
        );
    },
);
