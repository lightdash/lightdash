import { Ability } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    QueryExecutionContext,
    SnowflakeAuthenticationType,
    SupportedDbtAdapter,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    SshTunnel,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { UserService } from '../UserService';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import {
    buildAccount,
    projectWithSensitiveFields,
} from './ProjectService.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
    refreshDatabricksOAuthToken: vi.fn(),
    warehouseClientFromCredentials: vi.fn(),
    SshTunnel: vi.fn().mockImplementation(function MockSshTunnel(
        this: {
            overrideCredentials: CreateWarehouseCredentials;
            connect: () => Promise<CreateWarehouseCredentials>;
            disconnect: () => Promise<void>;
        },
        credentials: CreateWarehouseCredentials,
    ) {
        this.overrideCredentials = credentials;
        this.connect = vi.fn(async () => credentials);
        this.disconnect = vi.fn(async () => undefined);
    }),
}));

const baseAccount = buildAccount({
    accountType: 'session',
    userType: 'registered',
});
const account = {
    ...baseAccount,
    user: {
        ...baseAccount.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: ['create', 'update', 'view'] },
        ]),
    },
} as RegisteredAccount;
assertIsAccountWithOrg(account);
const { organizationUuid } = account.organization;

const snowflake = (): CreateSnowflakeCredentials => ({
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'account',
    user: 'stored-user',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    token: 'stale-access',
    refreshToken: 'stored-refresh',
    dataTimezone: 'Europe/London',
});
const databricks = (
    authenticationType = DatabricksAuthenticationType.OAUTH_M2M,
): CreateDatabricksCredentials => ({
    type: WarehouseTypes.DATABRICKS,
    authenticationType,
    serverHostName: 'workspace.databricks.com',
    httpPath: '/sql/preview',
    catalog: 'catalog',
    database: 'schema',
    oauthClientId: 'project-client',
    token: 'stale-access',
    refreshToken: 'stored-refresh',
    dataTimezone: 'Europe/London',
});
const authCases = [
    {
        name: 'Snowflake SSO',
        credentials: snowflake(),
        token: 'fresh-snowflake',
    },
    {
        name: 'Databricks M2M refresh',
        credentials: databricks(),
        token: 'fresh-databricks',
    },
    {
        name: 'Databricks M2M exchange',
        credentials: {
            ...databricks(),
            refreshToken: undefined,
            oauthClientSecret: 'client-secret',
        },
        token: 'exchanged-databricks',
    },
    {
        name: 'Databricks U2M',
        credentials: databricks(DatabricksAuthenticationType.OAUTH_U2M),
        token: 'fresh-databricks',
    },
];

const setup = (credentials: CreateWarehouseCredentials, enabled = true) => {
    const project = {
        ...projectWithSensitiveFields,
        warehouseConnection: credentials,
    };
    const projectModel = {
        ...singleRouteProjectModelMethods,
        getWithSensitiveFields: vi.fn(async () => project),
        getSummary: vi.fn(async () => project),
        getWarehouseCredentialsForProject: vi.fn(async () => credentials),
        getProjectWarehouseConfig: vi.fn(async () => ({})),
        getQueryTimezone: vi.fn(async () => 'Asia/Tokyo'),
        getWarehouseClientFromCredentials: vi.fn<
            ProjectModel['getWarehouseClientFromCredentials']
        >((creds, options) => warehouseClientFromCredentials(creds, options)),
        rotateRefreshToken: vi.fn(async () => undefined),
        updateWarehouseCredentials: vi.fn(),
    };
    const userWarehouseCredentialsModel = {
        findForProjectWithSecrets:
            vi.fn<UserWarehouseCredentialsModel['findForProjectWithSecrets']>(),
        findDatabricksOauthU2mForHostWithSecrets:
            vi.fn<
                UserWarehouseCredentialsModel['findDatabricksOauthU2mForHostWithSecrets']
            >(),
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const sshKeyPairModel = {
        find: vi.fn(async () => ({
            organizationUuid,
            privateKey: 'resolved-private-key',
        })),
    };
    const userOAuthGrantsModel = {
        getRefreshToken: vi.fn(async () => 'user-grant-refresh'),
    };
    const service = new ProjectService({
        refreshTokenRotation: { run: vi.fn() },
        lightdashConfig: {
            ...lightdashConfigMock,
            warehouseClient: {
                ...lightdashConfigMock.warehouseClient,
                resolveTimezonePreviewCredentials: enabled,
            },
        },
        projectModel,
        userWarehouseCredentialsModel,
        userOAuthGrantsModel,
        sshKeyPairModel,
        featureFlagModel: { get: vi.fn(async () => ({ enabled: false })) },
    } as unknown as ProjectServiceArguments);
    vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValue(true);
    const resolve = vi.spyOn(
        service.warehouseClientFactory,
        'resolveWarehouseCredentials',
    );
    const scope = vi.spyOn(
        service.warehouseClientFactory,
        'withWarehouseClient',
    );
    return {
        service,
        project,
        projectModel,
        userWarehouseCredentialsModel,
        userOAuthGrantsModel,
        sshKeyPairModel,
        resolve,
        scope,
        edit: (
            dataTimezone: string | null = 'America/New_York',
            actor = account,
        ) =>
            service.previewDataTimezone(actor, {
                mode: 'edit',
                projectUuid: project.projectUuid,
                warehouseType: credentials.type,
                dataTimezone,
            }),
        create: (actor: RegisteredAccount = account) =>
            service.previewDataTimezone(actor, {
                mode: 'create',
                credentials,
            }),
    };
};

const queries = vi.fn();
beforeEach(() => {
    vi.mocked(refreshDatabricksOAuthToken).mockResolvedValue({
        accessToken: 'fresh-databricks',
        refreshToken: 'rotated-databricks',
        expiresIn: 3600,
    });
    vi.mocked(exchangeDatabricksOAuthCredentials).mockResolvedValue({
        accessToken: 'exchanged-databricks',
        refreshToken: 'exchanged-refresh',
    });
    vi.spyOn(UserService, 'generateSnowflakeAccessToken').mockResolvedValue({
        accessToken: 'fresh-snowflake',
        refreshToken: 'rotated-snowflake',
    });
    vi.mocked(warehouseClientFromCredentials).mockImplementation(
        (credentials) => ({
            ...warehouseClientMock,
            credentials,
            getAdapterType: () => SupportedDbtAdapter.POSTGRES,
            runQuery: async (sql, tags, timezone) => {
                queries(credentials, sql, tags, timezone);
                if (
                    (credentials.type === WarehouseTypes.SNOWFLAKE ||
                        credentials.type === WarehouseTypes.DATABRICKS) &&
                    ![
                        'fresh-snowflake',
                        'fresh-databricks',
                        'exchanged-databricks',
                    ].includes(credentials.token ?? '')
                ) {
                    throw new Error(
                        'Warehouse rejected stale or missing access token',
                    );
                }
                return {
                    fields: {},
                    rows: [{ naive_instant: '2026-06-08 18:30:00' }],
                };
            },
        }),
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

const expectNoRefresh = () => {
    expect(UserService.generateSnowflakeAccessToken).not.toHaveBeenCalled();
    expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
    expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
};

describe('timezone preview credential resolution', () => {
    describe.each(['stale-access', undefined])(
        'stored token %s',
        (storedToken) => {
            it.each(authCases)(
                'edit queries with refreshed $name and unsaved timezone',
                async ({ credentials, token }) => {
                    const f = setup(
                        { ...credentials, token: storedToken },
                        true,
                    );
                    const result = await f.edit();
                    expect(queries).toHaveBeenCalledExactlyOnceWith(
                        expect.objectContaining({
                            token,
                            dataTimezone: 'America/New_York',
                        }),
                        expect.any(String),
                        expect.objectContaining({
                            query_context: QueryExecutionContext.API,
                            user_uuid: account.user.userUuid,
                        }),
                        'America/New_York',
                    );
                    expect(result.projectTimezone).toBe('Asia/Tokyo');
                    expect(f.resolve).toHaveBeenCalledExactlyOnceWith(
                        {
                            kind: 'binding',
                            projectUuid: f.project.projectUuid,
                            binding: { kind: 'original' },
                        },
                        expect.objectContaining({
                            purpose: 'query',
                            queryContext: QueryExecutionContext.API,
                            organizationUuid: f.project.organizationUuid,
                            actor: expect.objectContaining({
                                person: expect.objectContaining({
                                    userUuid: account.user.id,
                                }),
                            }),
                        }),
                    );
                    expect(f.scope.mock.calls[0][0]).toMatchObject({
                        kind: 'resolved',
                        projectUuid: f.project.projectUuid,
                        aiPlan: null,
                        warehouseConnectionUuid: null,
                        connectionRoute: {
                            route: 'single',
                            originalWarehouseConnectionUuid: null,
                        },
                        cachePolicy: 'disabled',
                    });
                    expect(
                        f.projectModel.updateWarehouseCredentials,
                    ).not.toHaveBeenCalled();
                    expect(f.project.warehouseConnection.dataTimezone).toBe(
                        'Europe/London',
                    );
                },
            );
            it.each(authCases)(
                'switch off keeps raw $name with no refresh',
                async ({ credentials }) => {
                    const f = setup(
                        { ...credentials, token: storedToken },
                        false,
                    );
                    await expect(f.edit()).rejects.toThrow(
                        'Warehouse rejected stale or missing access token',
                    );
                    expectNoRefresh();
                    expect(f.resolve).not.toHaveBeenCalled();
                    expect(f.scope.mock.calls[0][0]).toMatchObject({
                        kind: 'bypass',
                        mode: 'timezone_preview',
                        credentials: {
                            token: storedToken,
                            dataTimezone: 'America/New_York',
                        },
                    });
                    expect(
                        f.projectModel.rotateRefreshToken,
                    ).not.toHaveBeenCalled();
                },
            );
        },
    );

    it('edit null timezone clears the resolved stored timezone', async () => {
        const f = setup(snowflake());
        await f.edit(null);
        expect(queries).toHaveBeenCalledWith(
            expect.objectContaining({ dataTimezone: undefined }),
            expect.any(String),
            expect.any(Object),
            undefined,
        );
        expect(f.project.warehouseConnection.dataTimezone).toBe(
            'Europe/London',
        );
    });

    it('edit preserves an existing query client and adds no cache entries', async () => {
        const f = setup(snowflake());
        const cached = {
            ...warehouseClientMock,
            credentials: {
                ...snowflake(),
                token: 'fresh-snowflake',
                refreshToken: 'rotated-snowflake',
                dataTimezone: 'America/New_York',
                userWarehouseCredentialsUuid: undefined,
            },
        };
        f.service.warehouseClientFactory.warehouseClients[
            f.project.projectUuid
        ] = cached;
        await f.edit();
        expect(queries).toHaveBeenCalledOnce();
        expect(f.service.warehouseClientFactory.warehouseClients).toEqual({
            [f.project.projectUuid]: cached,
        });
        expect(
            f.service.warehouseClientFactory.warehouseClients[
                f.project.projectUuid
            ],
        ).toBe(cached);
    });

    it.each(authCases)(
        'create resolves submitted $name once',
        async ({ credentials, token }) => {
            const f = setup(credentials);
            await f.create();
            expect(queries).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    token,
                    dataTimezone: 'Europe/London',
                }),
                expect.any(String),
                expect.any(Object),
                'Europe/London',
            );
            expect(f.resolve).not.toHaveBeenCalled();
            expect(f.scope.mock.calls[0][0]).toMatchObject({
                kind: 'resolved',
                projectUuid: null,
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
                cachePolicy: 'disabled',
            });
            expect(f.service.warehouseClientFactory.warehouseClients).toEqual(
                {},
            );
            const calls =
                vi.mocked(UserService.generateSnowflakeAccessToken).mock.calls
                    .length +
                vi.mocked(refreshDatabricksOAuthToken).mock.calls.length +
                vi.mocked(exchangeDatabricksOAuthCredentials).mock.calls.length;
            expect(calls).toBe(1);
            if (credentials.type === WarehouseTypes.SNOWFLAKE) {
                expect(
                    f.userOAuthGrantsModel.getRefreshToken,
                ).toHaveBeenCalledOnce();
                expect(
                    UserService.generateSnowflakeAccessToken,
                ).toHaveBeenCalledWith('user-grant-refresh');
            }
        },
    );

    it.each(authCases)(
        'create switch off keeps raw $name',
        async ({ credentials }) => {
            const f = setup(credentials, false);
            await expect(f.create()).rejects.toThrow(
                'Warehouse rejected stale or missing access token',
            );
            expectNoRefresh();
            expect(
                f.userOAuthGrantsModel.getRefreshToken,
            ).not.toHaveBeenCalled();
            expect(f.scope.mock.calls[0][0]).toMatchObject({
                kind: 'bypass',
                mode: 'timezone_preview',
                projectUuid: null,
                credentials,
            });
        },
    );

    it.each([false, true])(
        'edit selects personal U2M credentials when required=%s',
        async (required) => {
            const f = setup({
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                refreshToken: undefined,
                requireUserCredentials: required,
            });
            f.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
                {
                    uuid: 'personal-uuid',
                    expiresAt: null,
                    credentials: {
                        ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                        oauthClientId: 'personal-client',
                        refreshToken: 'personal-refresh',
                        dataTimezone: 'Pacific/Auckland',
                    },
                } as Awaited<
                    ReturnType<
                        UserWarehouseCredentialsModel['findForProjectWithSecrets']
                    >
                >,
            );
            await f.edit();
            expect(refreshDatabricksOAuthToken).toHaveBeenCalledExactlyOnceWith(
                'workspace.databricks.com',
                'personal-client',
                'personal-refresh',
                undefined,
            );
            expect(
                f.userWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'personal-uuid',
                'personal-refresh',
                'rotated-databricks',
            );
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
            expect(queries).toHaveBeenCalledWith(
                expect.objectContaining({
                    token: 'fresh-databricks',
                    dataTimezone: 'America/New_York',
                    userWarehouseCredentialsUuid: 'personal-uuid',
                }),
                expect.any(String),
                expect.any(Object),
                'America/New_York',
            );
        },
    );

    it.each([null, 'other.databricks.com'])(
        'edit refuses a required missing or host-mismatched personal grant: %s',
        async (host) => {
            const f = setup({
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                requireUserCredentials: true,
            });
            if (host) {
                f.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
                    {
                        uuid: 'personal-uuid',
                        expiresAt: null,
                        credentials: {
                            ...databricks(
                                DatabricksAuthenticationType.OAUTH_U2M,
                            ),
                            serverHostName: host,
                            refreshToken: 'personal-refresh',
                        },
                    } as Awaited<
                        ReturnType<
                            UserWarehouseCredentialsModel['findForProjectWithSecrets']
                        >
                    >,
                );
            }
            await expect(f.edit()).rejects.toThrow(
                'Please authenticate to access Databricks',
            );
            expectNoRefresh();
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
        },
    );

    it('create resolves a host-matching U2M user grant once', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        f.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets.mockResolvedValue(
            {
                uuid: 'personal-uuid',
                expiresAt: null,
                credentials: {
                    ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                    refreshToken: 'personal-refresh',
                },
            } as Awaited<
                ReturnType<
                    UserWarehouseCredentialsModel['findDatabricksOauthU2mForHostWithSecrets']
                >
            >,
        );
        await f.create();
        expect(
            f.userWarehouseCredentialsModel
                .findDatabricksOauthU2mForHostWithSecrets,
        ).toHaveBeenCalledExactlyOnceWith(
            account.user.id,
            'workspace.databricks.com',
            { strictPersonalOverlay: false },
        );
        expect(refreshDatabricksOAuthToken).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'project-client',
            'personal-refresh',
            undefined,
        );
    });

    it('switch off keeps create bypass for an account with only Project abilities', async () => {
        const f = setup(
            {
                ...snowflake(),
                token: 'fresh-snowflake',
            },
            false,
        );
        await f.create();
        expectNoRefresh();
        expect(queries).toHaveBeenCalledTimes(1);
    });

    it('create resolves the SSH key reference before opening the tunnel', async () => {
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'database',
            port: 5432,
            user: 'user',
            password: 'password',
            dbname: 'db',
            schema: 'public',
            useSshTunnel: true,
            sshTunnelPublicKey: 'public-key',
            dataTimezone: 'America/New_York',
        };
        const f = setup(credentials);
        await f.create();
        expect(f.sshKeyPairModel.find.mock.calls).toEqual([
            ['public-key'],
            ['public-key'],
        ]);
        expect(SshTunnel).toHaveBeenCalledWith(
            expect.objectContaining({
                sshTunnelPrivateKey: 'resolved-private-key',
            }),
            undefined,
        );
        expect(queries).toHaveBeenCalledWith(
            expect.objectContaining({
                sshTunnelPrivateKey: 'resolved-private-key',
            }),
            expect.any(String),
            expect.any(Object),
            'America/New_York',
        );
    });

    it('does not fall back to raw credentials when refresh fails', async () => {
        const f = setup(snowflake());
        vi.mocked(UserService.generateSnowflakeAccessToken).mockRejectedValue(
            new Error('provider unavailable'),
        );
        await expect(f.edit()).rejects.toThrow(
            'Error refreshing snowflake token',
        );
        expect(f.scope).not.toHaveBeenCalled();
        expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
    });

    it.each(['edit', 'create'] as const)(
        '%s validates timezone before credential resolution',
        async (mode) => {
            const f = setup({ ...snowflake(), dataTimezone: 'not/a/timezone' });
            await expect(
                mode === 'edit' ? f.edit('not/a/timezone') : f.create(),
            ).rejects.toThrow('Invalid data timezone');
            expectNoRefresh();
            expect(f.resolve).not.toHaveBeenCalled();
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
        },
    );
});

it.each([true, false])(
    'hydrates secret-free BigQuery SSO with resolution enabled %s',
    async (enabled) => {
        const credentials: CreateBigqueryCredentials = {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.SSO,
            project: 'analytics',
            dataset: 'prod',
            timeoutSeconds: undefined,
            priority: undefined,
            retries: undefined,
            location: undefined,
            maximumBytesBilled: undefined,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'saved-client',
                refresh_token: 'saved-refresh',
            },
        };
        const f = setup(credentials, enabled);
        await f.edit();
        expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
            expect.objectContaining({
                keyfileContents: {
                    ...credentials.keyfileContents,
                    client_secret:
                        lightdashConfigMock.auth.google.oauth2ClientSecret,
                },
            }),
            expect.any(Object),
        );
        expect(credentials.keyfileContents).not.toHaveProperty('client_secret');
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    },
);
