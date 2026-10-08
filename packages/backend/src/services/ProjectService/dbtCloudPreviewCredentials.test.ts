import {
    DatabricksAuthenticationType,
    DbtProjectType,
    ProjectType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateDatabricksCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { createHmac } from 'crypto';
import fetch, { Response } from 'node-fetch';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { UserService } from '../UserService';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import { projectWithSensitiveFields, user } from './ProjectService.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    exchangeDatabricksOAuthCredentials: vi.fn(),
    refreshDatabricksOAuthToken: vi.fn(),
    warehouseClientFromCredentials: vi.fn(),
}));
vi.mock('node-fetch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node-fetch')>()),
    default: vi.fn(),
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
    token: undefined,
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
    token: undefined,
    refreshToken: 'stored-refresh',
});

const rawBody = Buffer.from('{"runId":2}');
const webhookSecret = 'webhook-secret';
const webhookAuth = {
    rawBody,
    signature: createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex'),
};

const setup = (
    credentials: CreateWarehouseCredentials,
    {
        enabled = true,
        compileEnabled = true,
        organizationUuid = null,
    }: {
        enabled?: boolean;
        compileEnabled?: boolean;
        organizationUuid?: string | null;
    } = {},
) => {
    const project = {
        ...projectWithSensitiveFields,
        createdByUserUuid: user.userUuid,
        dbtConnection: {
            type: DbtProjectType.DBT_CLOUD_IDE as const,
            api_key: 'dbt-api-key',
            environment_id: 'environment-id',
            webhook_hmac_secret: webhookSecret,
        },
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
        getWarehouseClientFromCredentials: vi.fn<
            ProjectModel['getWarehouseClientFromCredentials']
        >((clientCredentials, options) =>
            warehouseClientFromCredentials(clientCredentials, options),
        ),
        rotateRefreshToken: vi.fn(async () => undefined),
        getAllByOrganizationUuid: vi.fn(async () => [
            {
                ...project,
                projectUuid: 'preview-uuid',
                name: 'preview_34_12',
                type: ProjectType.PREVIEW,
            },
        ]),
    };
    const userWarehouseCredentialsModel = {
        findForProjectWithSecrets:
            vi.fn<UserWarehouseCredentialsModel['findForProjectWithSecrets']>(),
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const organizationWarehouseCredentialsModel = {
        rotateRefreshToken: vi.fn(async () => undefined),
    };
    const userOAuthGrantsModel = { get: vi.fn() };
    const userModel = { findSessionUserByUUID: vi.fn(async () => user) };
    const service = new ProjectService({
        lightdashConfig: {
            ...lightdashConfigMock,
            warehouseClient: {
                ...lightdashConfigMock.warehouseClient,
                resolveDbtCloudPreviewCredentials: enabled,
                resolveCompileCredentials: compileEnabled,
            },
        },
        projectModel,
        userModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        schedulerClient: { generateValidation: vi.fn() },
        featureFlagModel: { get: vi.fn(async () => ({ enabled: false })) },
    } as unknown as ProjectServiceArguments);
    const save = vi
        .spyOn(service, 'saveExploresToCacheAndIndexCatalog')
        .mockResolvedValue('preview-uuid');
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
        userModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        save,
        resolve,
        scope,
        preview: (auth = webhookAuth) =>
            service.createPreviewFromDbtCloudWebhook(
                project.projectUuid,
                1,
                2,
                auth,
            ),
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

const query = vi.fn();
const streamQuery = vi.fn();
const executeAsyncQuery = vi.fn();
const testConnection = vi.fn();

beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
                metadata: {
                    env: { DBT_CLOUD_PR_ID: '12', DBT_CLOUD_JOB_ID: '34' },
                },
                nodes: {
                    'model.fixture.orders': {
                        unique_id: 'model.fixture.orders',
                        name: 'orders',
                        package_name: 'fixture',
                        resource_type: 'model',
                        compiled: true,
                        database: 'analytics',
                        schema: 'public',
                        alias: 'orders',
                        checksum: { name: '', checksum: '' },
                        fqn: ['fixture', 'orders'],
                        language: 'sql',
                        path: 'models/orders.sql',
                        raw_code: 'select 1 as id',
                        description: '',
                        tags: [],
                        depends_on: { nodes: [] },
                        patch_path: null,
                        original_file_path: 'models/orders.sql',
                        relation_name: 'analytics.public.orders',
                        config: { materialized: 'table' },
                        meta: {},
                        columns: {
                            id: { name: 'id', data_type: 'number', meta: {} },
                        },
                    },
                },
            }),
        ),
    );
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
    vi.mocked(warehouseClientFromCredentials).mockImplementation(
        (credentials) => {
            if (
                (credentials.type === WarehouseTypes.SNOWFLAKE ||
                    credentials.type === WarehouseTypes.DATABRICKS) &&
                !credentials.token
            ) {
                throw new Error(
                    'OAuth access token is required for client construction',
                );
            }
            return {
                ...warehouseClientMock,
                credentials,
                runQuery: query,
                streamQuery,
                executeAsyncQuery,
                test: testConnection,
            };
        },
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

const authCases = [
    {
        name: 'Snowflake SSO',
        credentials: snowflake(),
        token: 'refreshed-snowflake',
        rotated: 'rotated-snowflake',
        organizationUuid: null,
    },
    {
        name: 'Databricks M2M refresh',
        credentials: databricks(),
        token: 'refreshed-access',
        rotated: 'rotated-refresh',
        organizationUuid: null,
    },
    {
        name: 'Databricks M2M exchange',
        credentials: {
            ...databricks(),
            refreshToken: undefined,
            oauthClientSecret: 'client-secret',
        },
        token: 'exchanged-access',
        rotated: 'exchanged-refresh',
        organizationUuid: null,
    },
    {
        name: 'Databricks U2M',
        credentials: databricks(DatabricksAuthenticationType.OAUTH_U2M),
        token: 'refreshed-access',
        rotated: 'rotated-refresh',
        organizationUuid: null,
    },
    {
        name: 'organisation Snowflake SSO',
        credentials: {
            ...snowflake(),
            refreshToken: 'org-refresh',
            requireUserCredentials: true,
        },
        token: 'refreshed-snowflake',
        rotated: 'rotated-snowflake',
        organizationUuid: 'org-credential-uuid',
    },
];

describe('dbt Cloud preview credential resolution', () => {
    it.each(authCases)(
        'webhook resolves $name before client construction',
        async ({ credentials, token, rotated, organizationUuid }) => {
            const f = setup(credentials, { organizationUuid });
            await expect(f.preview()).resolves.toBe('preview-uuid');
            expect(
                warehouseClientFromCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    ...credentials,
                    token,
                    refreshToken: rotated,
                }),
                expect.any(Object),
            );
            expect(f.resolve).toHaveBeenCalledExactlyOnceWith(
                {
                    kind: 'binding',
                    projectUuid: f.project.projectUuid,
                    binding: { kind: 'original' },
                },
                expect.objectContaining({
                    purpose: 'compile',
                    queryContext: null,
                    actor: expect.objectContaining({
                        person: {
                            userUuid: user.userUuid,
                            isRegisteredUser: true,
                            isServiceAccount: false,
                        },
                    }),
                }),
            );
            expect(f.scope).toHaveBeenCalledWith(
                expect.objectContaining({
                    kind: 'compile',
                    projectUuid: f.project.projectUuid,
                    credentials: expect.objectContaining({ token }),
                }),
                expect.any(Object),
                expect.any(Function),
            );
            if (organizationUuid) {
                expect(
                    f.organizationWarehouseCredentialsModel.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    organizationUuid,
                    'org-refresh',
                    rotated,
                );
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            } else if (credentials.refreshToken) {
                expect(
                    f.projectModel.rotateRefreshToken,
                ).toHaveBeenCalledExactlyOnceWith(
                    f.project.projectUuid,
                    credentials.refreshToken,
                    rotated,
                );
                expect(
                    f.organizationWarehouseCredentialsModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            } else {
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            }
            expect(
                f.userWarehouseCredentialsModel.findForProjectWithSecrets,
            ).not.toHaveBeenCalled();
            expect(f.userOAuthGrantsModel.get).not.toHaveBeenCalled();
            expect(query).not.toHaveBeenCalled();
            expect(streamQuery).not.toHaveBeenCalled();
            expect(executeAsyncQuery).not.toHaveBeenCalled();
            expect(testConnection).not.toHaveBeenCalled();
            expect(f.service.warehouseClientFactory.warehouseClients).toEqual(
                {},
            );
            expect(f.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    explores: [
                        expect.objectContaining({
                            name: 'orders',
                            tables: expect.objectContaining({
                                orders: expect.any(Object),
                            }),
                        }),
                    ],
                }),
            );
            let endpoint;
            if (credentials.type === WarehouseTypes.SNOWFLAKE) {
                endpoint = UserService.generateSnowflakeAccessToken;
            } else if (credentials.refreshToken) {
                endpoint = refreshDatabricksOAuthToken;
            } else {
                endpoint = exchangeDatabricksOAuthCredentials;
            }
            expect(endpoint).toHaveBeenCalledTimes(1);
        },
    );

    it.each(authCases)(
        'switch off passes raw $name credentials without refresh',
        async ({ credentials, organizationUuid }) => {
            const f = setup(credentials, { enabled: false, organizationUuid });
            await expect(f.preview()).rejects.toThrow(
                'OAuth access token is required',
            );
            expect(
                warehouseClientFromCredentials,
            ).toHaveBeenCalledExactlyOnceWith(credentials, expect.any(Object));
            expect(f.resolve).not.toHaveBeenCalled();
            expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
            expect(exchangeDatabricksOAuthCredentials).not.toHaveBeenCalled();
            expect(
                UserService.generateSnowflakeAccessToken,
            ).not.toHaveBeenCalled();
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
            expect(
                f.userWarehouseCredentialsModel.findForProjectWithSecrets,
            ).not.toHaveBeenCalled();
            expect(
                f.userWarehouseCredentialsModel.rotateRefreshToken,
            ).not.toHaveBeenCalled();
        },
    );

    it('uses the creator matching U2M credential only when project refresh is absent', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        setUserFallback(f);
        await f.preview();
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).toHaveBeenCalledExactlyOnceWith(
            f.project.projectUuid,
            user.userUuid,
            WarehouseTypes.DATABRICKS,
        );
        expect(refreshDatabricksOAuthToken).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'user-client',
            'user-refresh',
            undefined,
        );
        expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
            expect.objectContaining({
                token: 'refreshed-access',
                httpPath: '/sql/compile',
                database: 'compile_schema',
                catalog: 'compile_catalog',
            }),
            expect.any(Object),
        );
        expect(
            f.userWarehouseCredentialsModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'user-credential-uuid',
            'user-refresh',
            'rotated-refresh',
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it.each(['missing', 'host mismatch'])(
        'rejects %s creator U2M credentials before construction',
        async (failure) => {
            const f = setup({
                ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
                refreshToken: undefined,
            });
            if (failure === 'host mismatch')
                setUserFallback(f, 'other.databricks.com');
            await expect(f.preview()).rejects.toThrow(
                failure === 'missing'
                    ? 'No refresh token available'
                    : 'Please authenticate',
            );
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
            expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
        },
    );

    it.each([true, false])(
        'keeps signature validation before resolution with switch %s',
        async (enabled) => {
            const f = setup(snowflake(), { enabled });
            await expect(
                f.preview({ ...webhookAuth, signature: 'invalid' }),
            ).rejects.toThrow('Invalid dbt Cloud webhook signature');
            expect(f.resolve).not.toHaveBeenCalled();
            expect(f.userModel.findSessionUserByUUID).not.toHaveBeenCalled();
            expect(fetch).not.toHaveBeenCalled();
            expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
            expect(
                UserService.generateSnowflakeAccessToken,
            ).not.toHaveBeenCalled();
        },
    );

    it.each([true, false])(
        'does not query with a present stale token and switch %s',
        async (enabled) => {
            const f = setup(
                { ...snowflake(), token: 'stale-access' },
                { enabled },
            );
            await f.preview();
            expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
                expect.objectContaining({
                    token: enabled ? 'refreshed-snowflake' : 'stale-access',
                }),
                expect.any(Object),
            );
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(query).not.toHaveBeenCalled();
            expect(streamQuery).not.toHaveBeenCalled();
            expect(executeAsyncQuery).not.toHaveBeenCalled();
            expect(testConnection).not.toHaveBeenCalled();
        },
    );

    it.each([true, false])(
        'webhook switch stays independent of disabled compile resolution: %s',
        async (enabled) => {
            const f = setup(
                { ...snowflake(), token: 'stale-access' },
                { enabled, compileEnabled: false },
            );
            await f.preview();
            expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
                expect.objectContaining({
                    token: enabled ? 'refreshed-snowflake' : 'stale-access',
                }),
                expect.any(Object),
            );
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );
});
