import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DbtProjectType,
    EMPTY_WAREHOUSE_LOCATION,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateDatabricksCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type DbtManifest,
} from '@lightdash/common';
import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { type ProjectAdapter } from '../../types';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { UserService } from '../UserService';
import { connectionContextFromUser } from '../WarehouseClientFactory/ConnectionContext';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import { projectWithSensitiveFields, user } from './ProjectService.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
    refreshDatabricksOAuthToken: vi.fn(),
    warehouseClientFromCredentials: vi.fn(),
}));

const databricks = (
    authenticationType = DatabricksAuthenticationType.OAUTH_M2M,
): CreateDatabricksCredentials => ({
    type: WarehouseTypes.DATABRICKS,
    authenticationType,
    serverHostName: 'workspace.databricks.com',
    httpPath: '/sql/compile',
    catalog: 'compile_catalog',
    database: 'compile_schema',
    oauthClientId: 'project-client',
    token: 'project-access',
    refreshToken: 'project-refresh',
});
const snowflake = (): CreateSnowflakeCredentials => ({
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'account',
    user: 'stored-user',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    token: 'stored-access',
    refreshToken: 'stored-refresh',
});

const setup = (
    credentials: CreateWarehouseCredentials,
    {
        enabled = true,
        organizationUuid = null,
    }: { enabled?: boolean; organizationUuid?: string | null } = {},
) => {
    const project = {
        ...projectWithSensitiveFields,
        warehouseConnection: credentials,
        organizationWarehouseCredentialsUuid: organizationUuid,
    };
    const projectModel = {
        ...singleRouteProjectModelMethods,
        getWithSensitiveFields: vi.fn(async () => project),
        getWarehouseCredentialsForProject: vi.fn(async () => credentials),
        getProjectWarehouseConfig: vi.fn(async () => ({
            organizationWarehouseCredentialsUuid: organizationUuid,
        })),
        getSummary: vi.fn(async () => project),
        getDbtSourceIdentity: vi.fn(async () => ({
            dbtSourceUuid: 'primary-source',
            dbtSourceName: 'primary',
        })),
        getWarehouseFromCache: vi.fn(async () => undefined),
        saveWarehouseToCache: vi.fn(async () => undefined),
        getWarehouseClientFromCredentials: vi.fn<
            ProjectModel['getWarehouseClientFromCredentials']
        >((clientCredentials, options) =>
            warehouseClientFromCredentials(clientCredentials, options),
        ),
        rotateRefreshToken: vi.fn(async () => undefined),
        resolveWarehouseCredentialReadWithRoute: vi.fn<
            ProjectModel['resolveWarehouseCredentialReadWithRoute']
        >(
            singleRouteProjectModelMethods.resolveWarehouseCredentialReadWithRoute,
        ),
    };
    const userWarehouseCredentialsModel = {
        findForProjectWithSecrets:
            vi.fn<UserWarehouseCredentialsModel['findForProjectWithSecrets']>(),
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const organizationWarehouseCredentialsModel = {
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const warehouseConnectionModel = {
        getProject: vi.fn(async () => ({
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
        })),
        getExtraCredentialSource: vi.fn(async () => ({
            credentials,
            organizationWarehouseCredentialsUuid: organizationUuid,
        })),
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const userOAuthGrantsModel = { get: vi.fn() };
    const projectDbtSourcesModel = {
        getSourcesWithBindings:
            vi.fn<ProjectDbtSourcesModel['getSourcesWithBindings']>(),
    };
    const warehouseConnectionCompileModel = {
        getCompileConnections:
            vi.fn<WarehouseConnectionCompileModel['getCompileConnections']>(),
        getCatalogCache: vi.fn(async () => undefined),
    };
    const service = new ProjectService({
        lightdashConfig: {
            ...lightdashConfigMock,
            warehouseClient: {
                ...lightdashConfigMock.warehouseClient,
                resolveCompileCredentials: enabled,
            },
        },
        projectModel,
        projectDbtSourcesModel,
        warehouseConnectionCompileModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        warehouseConnectionModel,
        userOAuthGrantsModel,
        featureFlagModel: { get: vi.fn(async () => ({ enabled: false })) },
    } as unknown as ProjectServiceArguments);
    const prepare = () =>
        (
            service as unknown as {
                prepareCompileAdapter: (
                    projectUuid: string,
                    actor: typeof user,
                ) => Promise<{
                    warehouseCredentials: CreateWarehouseCredentials;
                }>;
            }
        ).prepareCompileAdapter(project.projectUuid, user);
    const extra = async () => {
        projectModel.resolveWarehouseCredentialReadWithRoute.mockResolvedValue({
            route: 'multi',
            target: { kind: 'extra', warehouseConnectionUuid: 'extra-uuid' },
            originalWarehouseConnectionUuid: 'original-uuid',
        });
        return service.warehouseClientFactory.resolveWarehouseCredentials(
            {
                kind: 'binding',
                projectUuid: project.projectUuid,
                binding: {
                    kind: 'connection',
                    warehouseConnectionUuid: 'extra-uuid',
                },
            },
            connectionContextFromUser(user, {
                organizationUuid: project.organizationUuid,
                queryContext: null,
                purpose: 'compile',
            }),
        );
    };
    return {
        service,
        project,
        projectModel,
        projectDbtSourcesModel,
        warehouseConnectionCompileModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        warehouseConnectionModel,
        userOAuthGrantsModel,
        prepare,
        extra,
    };
};

const setUserFallback = (
    fixture: ReturnType<typeof setup>,
    host = 'https://WORKSPACE.databricks.com/',
) => {
    fixture.userWarehouseCredentialsModel.findForProjectWithSecrets.mockResolvedValue(
        {
            uuid: 'user-credential-uuid',
            expiresAt: null,
            credentials: {
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                serverHostName: host,
                oauthClientId: 'user-client',
                token: 'user-access',
                refreshToken: 'user-refresh',
            },
        } as Awaited<
            ReturnType<
                UserWarehouseCredentialsModel['findForProjectWithSecrets']
            >
        >,
    );
};

beforeEach(() => {
    vi.mocked(refreshDatabricksOAuthToken).mockResolvedValue({
        accessToken: 'refreshed-access',
        refreshToken: 'rotated-refresh',
        expiresIn: 3600,
    });
    vi.mocked(exchangeDatabricksOAuthCredentials).mockResolvedValue({
        accessToken: 'exchanged-access',
        refreshToken: 'exchanged-refresh',
    });
    vi.spyOn(UserService, 'generateSnowflakeAccessToken').mockResolvedValue({
        accessToken: 'refreshed-snowflake',
        refreshToken: 'rotated-snowflake',
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('compile credential resolution', () => {
    it.each([
        DatabricksAuthenticationType.OAUTH_M2M,
        DatabricksAuthenticationType.OAUTH_U2M,
    ])('persists %s project rotation', async (auth) => {
        const f = setup(databricks(auth));
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
            refreshToken: 'rotated-refresh',
        });
        expect(
            f.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            f.project.projectUuid,
            'project-refresh',
            'rotated-refresh',
        );
        expect(refreshDatabricksOAuthToken).toHaveBeenCalledTimes(1);
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
    });

    it('persists U2M fallback rotation to the user credential and preserves compile location', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        setUserFallback(f);
        const prepared = await f.prepare();
        expect(
            f.userWarehouseCredentialsModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'user-credential-uuid',
            'user-refresh',
            'rotated-refresh',
        );
        expect(prepared.warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
            oauthClientId: 'user-client',
            httpPath: '/sql/compile',
            catalog: 'compile_catalog',
            database: 'compile_schema',
        });
        expect(refreshDatabricksOAuthToken).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'user-client',
            'user-refresh',
            undefined,
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a fallback from another workspace', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        setUserFallback(f, 'other.databricks.com');
        await expect(f.prepare()).rejects.toThrow();
        expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
    });

    it('persists organisation Snowflake rotation to the organisation exactly once', async () => {
        const f = setup(
            { ...snowflake(), refreshToken: 'org-refresh' },
            { organizationUuid: 'org-credential-uuid' },
        );
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'refreshed-snowflake',
            refreshToken: 'rotated-snowflake',
        });
        expect(
            f.organizationWarehouseCredentialsModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'org-credential-uuid',
            'org-refresh',
            'rotated-snowflake',
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        expect(
            UserService.generateSnowflakeAccessToken,
        ).toHaveBeenCalledExactlyOnceWith('org-refresh');
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'uses stored Snowflake credentials without a user grant when requireUserCredentials is %s',
        async (requireUserCredentials) => {
            const f = setup({ ...snowflake(), requireUserCredentials });
            expect((await f.prepare()).warehouseCredentials).toMatchObject({
                token: 'refreshed-snowflake',
            });
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledExactlyOnceWith('stored-refresh');
            expect(
                f.userWarehouseCredentialsModel.findForProjectWithSecrets,
            ).not.toHaveBeenCalled();
            expect(f.userOAuthGrantsModel.get).not.toHaveBeenCalled();
        },
    );

    it('exchanges M2M client credentials without a user grant or rotation write', async () => {
        const f = setup({
            ...databricks(),
            refreshToken: undefined,
            oauthClientSecret: 'client-secret',
        });
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'exchanged-access',
        });
        expect(
            exchangeDatabricksOAuthCredentials,
        ).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'project-client',
            'client-secret',
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
    });

    it('keeps the shared compile selector available when standalone compile resolution is off', async () => {
        const f = setup(databricks(), { enabled: false });
        const resolution =
            await f.service.warehouseClientFactory.resolveWarehouseCredentials(
                {
                    kind: 'binding',
                    projectUuid: f.project.projectUuid,
                    binding: { kind: 'original' },
                },
                connectionContextFromUser(user, {
                    organizationUuid: f.project.organizationUuid,
                    queryContext: null,
                    purpose: 'compile',
                }),
            );
        expect(resolution.warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
        });
        expect(
            f.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            f.project.projectUuid,
            'project-refresh',
            'rotated-refresh',
        );
    });

    it('does not use a personal fallback for organisation U2M credentials', async () => {
        const f = setup(
            {
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                refreshToken: undefined,
            },
            { organizationUuid: 'org-credential-uuid' },
        );
        setUserFallback(f);
        await expect(f.prepare()).rejects.toThrow('No refresh token available');
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
        expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
    });

    it('does not use a personal fallback for extra U2M credentials', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        setUserFallback(f);
        await expect(f.extra()).rejects.toThrow('No refresh token available');
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).not.toHaveBeenCalled();
        expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
    });

    it('does not write an unchanged refresh token', async () => {
        vi.mocked(refreshDatabricksOAuthToken).mockResolvedValue({
            accessToken: 'refreshed-access',
            refreshToken: 'project-refresh',
            expiresIn: 3600,
        });
        const f = setup(databricks());
        await f.prepare();
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('keeps the usable access token when rotation persistence fails', async () => {
        const f = setup(databricks());
        f.projectModel.rotateRefreshToken.mockRejectedValue(
            new Error('write failed'),
        );
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
        });
        expect(f.projectModel.rotateRefreshToken).toHaveBeenCalledTimes(1);
    });

    it.each([true, false])(
        'runs the BigQuery preview repair check once with compile resolution %s',
        async (enabled) => {
            const f = setup(
                {
                    type: WarehouseTypes.BIGQUERY,
                    project: 'project',
                    dataset: 'dataset',
                    timeoutSeconds: undefined,
                    priority: undefined,
                    retries: undefined,
                    location: undefined,
                    maximumBytesBilled: undefined,
                    authenticationType: BigqueryAuthenticationType.SSO,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id: 'google-client',
                        refresh_token: 'google-refresh',
                    },
                },
                { enabled },
            );
            await f.prepare();
            expect(f.projectModel.getSummary).toHaveBeenCalledExactlyOnceWith(
                f.project.projectUuid,
            );
        },
    );

    it.each([
        databricks(),
        databricks(DatabricksAuthenticationType.OAUTH_U2M),
        snowflake(),
    ])(
        'rejects token-only $type/$authenticationType rows on, and keeps the legacy token off',
        async (credentials) => {
            const tokenOnly = { ...credentials, refreshToken: undefined };
            await expect(setup(tokenOnly).prepare()).rejects.toThrow();
            expect(
                (await setup(tokenOnly, { enabled: false }).prepare())
                    .warehouseCredentials,
            ).toMatchObject({ token: credentials.token });
        },
    );

    it.each([
        DatabricksAuthenticationType.OAUTH_M2M,
        DatabricksAuthenticationType.OAUTH_U2M,
    ])('switch off keeps missing %s project rotation writes', async (auth) => {
        const f = setup(databricks(auth), { enabled: false });
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
        });
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('switch off keeps unchecked U2M fallback and missing user rotation write', async () => {
        const f = setup(
            {
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                refreshToken: undefined,
            },
            { enabled: false },
        );
        setUserFallback(f, 'other.databricks.com');
        expect((await f.prepare()).warehouseCredentials).toMatchObject({
            token: 'refreshed-access',
        });
        expect(
            f.userWarehouseCredentialsModel.rotateRefreshToken,
        ).not.toHaveBeenCalled();
    });

    it('switch off attempts organisation Snowflake rotation on the project', async () => {
        const f = setup(
            { ...snowflake(), refreshToken: 'org-refresh' },
            { enabled: false, organizationUuid: 'org-credential-uuid' },
        );
        await f.prepare();
        expect(
            f.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            f.project.projectUuid,
            'org-refresh',
            'rotated-snowflake',
        );
        expect(
            f.organizationWarehouseCredentialsModel.rotateRefreshToken,
        ).not.toHaveBeenCalled();
    });

    it.each([true, false])(
        'loads and refreshes each compile group once through the service with switch %s',
        async (enabled) => {
            const f = setup(snowflake(), { enabled });
            const buildManifest = (name: string): DbtManifest => ({
                nodes: Object.fromEntries([
                    [
                        `model.fixture.${name}`,
                        {
                            unique_id: `model.fixture.${name}`,
                            name,
                            package_name: 'fixture',
                            resource_type: 'model',
                            compiled: true,
                            database: 'analytics',
                            schema: 'public',
                            alias: name,
                            checksum: { name: '', checksum: '' },
                            fqn: ['fixture', name],
                            language: 'sql',
                            path: `models/${name}.sql`,
                            raw_code: 'select 1 as id',
                            description: '',
                            tags: [],
                            depends_on: { nodes: [] },
                            patch_path: null,
                            original_file_path: `models/${name}.sql`,
                            relation_name: `analytics.public.${name}`,
                            config: {
                                materialized: 'table',
                                snowflake_warehouse: '',
                            },
                            meta: {},
                            columns: {
                                id: {
                                    name: 'id',
                                    data_type: 'number',
                                    meta: {},
                                },
                            },
                        },
                    ],
                ]),
                metrics: {},
                docs: {},
                metadata: {
                    adapter_type: 'snowflake',
                    generated_at: '2026-10-08T00:00:00Z',
                    dbt_schema_version:
                        'https://schemas.getdbt.com/dbt/manifest/v11.json',
                },
            });
            f.project.dbtConnection = {
                type: DbtProjectType.MANIFEST,
                manifest: JSON.stringify(buildManifest('primary')),
                hideRefreshButton: true,
            };
            f.warehouseConnectionModel.getExtraCredentialSource.mockResolvedValue(
                {
                    credentials: {
                        ...snowflake(),
                        token: 'extra-access',
                        refreshToken: 'extra-refresh',
                    },
                    organizationWarehouseCredentialsUuid: null,
                },
            );
            vi.mocked(
                UserService.generateSnowflakeAccessToken,
            ).mockImplementation(async (refreshToken) => ({
                accessToken: `fresh-${refreshToken}`,
                refreshToken: `rotated-${refreshToken}`,
            }));
            vi.mocked(warehouseClientFromCredentials).mockImplementation(
                (credentials) => ({
                    ...warehouseClientMock,
                    credentials,
                    test: vi.fn(async () => {
                        expect(credentials).toMatchObject({
                            token: 'fresh-extra-refresh',
                        });
                    }),
                }),
            );
            f.projectModel.resolveWarehouseCredentialReadWithRoute.mockImplementation(
                async (_uuid, binding) => ({
                    route: 'multi',
                    target:
                        binding.kind === 'connection' &&
                        binding.warehouseConnectionUuid !== null
                            ? {
                                  kind: 'extra',
                                  warehouseConnectionUuid:
                                      binding.warehouseConnectionUuid,
                              }
                            : { kind: 'original' },
                    originalWarehouseConnectionUuid: 'original-uuid',
                }),
            );
            f.warehouseConnectionCompileModel.getCompileConnections.mockResolvedValue(
                [
                    {
                        warehouseConnectionUuid: 'original-uuid',
                        name: 'Original',
                        isOriginal: true,
                        listAllDatabases: false,
                        additionalDatabases: [],
                    },
                    {
                        warehouseConnectionUuid: 'extra-uuid',
                        name: 'Extra',
                        isOriginal: false,
                        listAllDatabases: false,
                        additionalDatabases: [],
                    },
                ],
            );
            f.projectDbtSourcesModel.getSourcesWithBindings.mockResolvedValue(
                ['first-source', 'second-source'].map((name, precedence) => ({
                    projectDbtSourceUuid: name,
                    projectUuid: f.project.projectUuid,
                    name,
                    precedence,
                    warehouseConnectionUuid: 'extra-uuid',
                    warehouseLocation: EMPTY_WAREHOUSE_LOCATION,
                    dbtConnection: {
                        type: DbtProjectType.MANIFEST,
                        manifest: JSON.stringify(buildManifest(name)),
                        hideRefreshButton: true,
                    },
                    hasCredentialError: false,
                    isPrimary: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })),
            );
            const probe = f.service as unknown as {
                withCompileAdapter: ProjectService['withCompileAdapter'];
                compileMultiConnectionProject: ProjectService['compileMultiConnectionProject'];
            };
            const adapters: ProjectAdapter[] = [];
            const compiled = await probe.withCompileAdapter(
                f.project.projectUuid,
                user,
                (primary) =>
                    probe.compileMultiConnectionProject({
                        projectUuid: f.project.projectUuid,
                        organizationUuid: f.project.organizationUuid,
                        userUuid: user.userUuid,
                        primary,
                        manifestFetchAdapters: adapters,
                        trackingParams: {
                            projectUuid: f.project.projectUuid,
                            organizationUuid: f.project.organizationUuid,
                            userUuid: user.userUuid,
                        },
                    }),
                adapters,
            );
            expect(compiled.warnings).toEqual([]);
            expect(compiled.carry).toEqual({
                kind: 'connections',
                warehouseConnectionUuids: [],
            });
            expect(
                f.warehouseConnectionModel.getExtraCredentialSource,
            ).toHaveBeenCalledTimes(1);
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledTimes(2);
            expect(
                f.warehouseConnectionModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                await f.warehouseConnectionModel.getProject(),
                'extra-uuid',
                'extra-refresh',
                'rotated-extra-refresh',
            );
            expect(
                f.projectModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                f.project.projectUuid,
                'stored-refresh',
                'rotated-stored-refresh',
            );
            expect(
                f.userWarehouseCredentialsModel.findForProjectWithSecrets,
            ).not.toHaveBeenCalled();
            await Promise.all(adapters.map((adapter) => adapter.destroy()));
            await compiled.originalAdapter.destroy();
        },
    );

    describe.each([true, false])('extra compile with switch %s', (enabled) => {
        it.each([databricks(), snowflake()])(
            'rotates $type on the warehouse connection once',
            async (credentials) => {
                const f = setup(credentials, { enabled });
                const result = await f.extra();
                const rotated =
                    credentials.type === WarehouseTypes.SNOWFLAKE
                        ? 'rotated-snowflake'
                        : 'rotated-refresh';
                expect(result.warehouseCredentials).toMatchObject({
                    refreshToken: rotated,
                });
                expect(
                    f.warehouseConnectionModel.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    await f.warehouseConnectionModel.getProject(),
                    'extra-uuid',
                    credentials.refreshToken,
                    rotated,
                );
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
                expect(
                    f.userWarehouseCredentialsModel.findForProjectWithSecrets,
                ).not.toHaveBeenCalled();
                expect(
                    credentials.type === WarehouseTypes.SNOWFLAKE
                        ? UserService.generateSnowflakeAccessToken
                        : refreshDatabricksOAuthToken,
                ).toHaveBeenCalledTimes(1);
            },
        );
        it('rotates an organisation-backed extra on the organisation once', async () => {
            const f = setup(
                {
                    ...snowflake(),
                    refreshToken: 'org-refresh',
                    requireUserCredentials: true,
                },
                { enabled, organizationUuid: 'org-credential-uuid' },
            );
            await f.extra();
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledExactlyOnceWith(
                'org-credential-uuid',
                'org-refresh',
                'rotated-snowflake',
            );
            expect(
                f.warehouseConnectionModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledTimes(1);
        });
    });
});
