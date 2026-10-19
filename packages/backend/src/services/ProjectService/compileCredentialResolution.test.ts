import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DbtProjectType,
    EMPTY_WAREHOUSE_LOCATION,
    FeatureFlags,
    ProjectType,
    RequestMethod,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
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
import execa from 'execa';
import fs, { writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DbtCliClient } from '../../dbt/dbtCliClient';
import { CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS } from '../../dbt/dbtProcessEnvironment';
import { profileFromCredentials } from '../../dbt/profiles';
import { bigqueryAdc, bigqueryAdcTarget } from '../../dbt/targets/targets.mock';
import { type ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { DbtLocalCredentialsProjectAdapter } from '../../projectAdapters/dbtLocalCredentialsProjectAdapter';
import { type ProjectAdapter } from '../../types';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { UserService } from '../UserService';
import { connectionContextFromUser } from '../WarehouseClientFactory/ConnectionContext';
import type { CredentialResolver } from '../WarehouseClientFactory/CredentialResolver';
import { type CheckGoogleRefreshToken } from './previewBigquerySsoCredentials';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import { projectWithSensitiveFields, user } from './ProjectService.mock';

const { previousCacheSetting } = vi.hoisted(() => {
    const previous = process.env.EXPERIMENTAL_CACHE;
    process.env.EXPERIMENTAL_CACHE = 'true';
    return { previousCacheSetting: previous };
});
afterAll(() => {
    if (previousCacheSetting === undefined)
        delete process.env.EXPERIMENTAL_CACHE;
    else process.env.EXPERIMENTAL_CACHE = previousCacheSetting;
});

vi.mock('execa', () => ({ default: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    const write = vi.fn(actual.writeFileSync);
    return {
        ...actual,
        writeFileSync: write,
        default: { ...actual, writeFileSync: write },
    };
});

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
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const project = {
        ...projectWithSensitiveFields,
        warehouseConnection: credentials,
    };
    const projectModel = {
        ...singleRouteProjectModelMethods,
        getWithSensitiveFields: vi.fn(async () => project),
        getWarehouseCredentialsForProject: vi.fn(async () => credentials),
        getProjectWarehouseConfig: vi.fn(async () => ({})),
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
    const warehouseConnectionModel = {
        getProject: vi.fn(async () => ({
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
        })),
        getExtraCredentialSource: vi.fn(async () => ({
            credentials,
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
    const featureFlagModel = {
        get: vi.fn(
            async (_input: { featureFlagId: FeatureFlags; user: unknown }) => ({
                enabled: false,
            }),
        ),
    };
    const service = new ProjectService({
        analytics: { track: vi.fn() },
        refreshTokenRotation: { run: vi.fn() },
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
        warehouseConnectionModel,
        userOAuthGrantsModel,
        featureFlagModel,
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
        featureFlagModel,
        project,
        projectModel,
        projectDbtSourcesModel,
        warehouseConnectionCompileModel,
        userWarehouseCredentialsModel,
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

    describe.each([true, false])(
        'BigQuery preview repair with compile resolution %s',
        (enabled) => {
            it.each([true, false])(
                'checks once and repairs only a rejected token: %s',
                async (rejected) => {
                    const stale: CreateBigqueryCredentials = {
                        type: WarehouseTypes.BIGQUERY,
                        project: 'preview-project',
                        dataset: 'preview_dataset',
                        timeoutSeconds: undefined,
                        priority: undefined,
                        retries: undefined,
                        location: undefined,
                        maximumBytesBilled: undefined,
                        authenticationType: BigqueryAuthenticationType.SSO,
                        keyfileContents: {
                            type: 'authorized_user',
                            client_id: 'google-client',
                            refresh_token: 'preview-refresh',
                        },
                    };
                    const upstream: CreateBigqueryCredentials = {
                        ...stale,
                        project: 'upstream-project',
                        dataset: 'upstream_dataset',
                        keyfileContents: {
                            ...stale.keyfileContents,
                            refresh_token: 'upstream-refresh',
                        },
                    };
                    const f = setup(stale, { enabled });
                    f.project.type = ProjectType.PREVIEW;
                    f.project.upstreamProjectUuid = 'upstream-uuid';
                    const checkRefreshToken = vi.fn<CheckGoogleRefreshToken>(
                        async (keyfile) =>
                            rejected &&
                            keyfile.refresh_token === 'preview-refresh'
                                ? 'rejected'
                                : 'valid',
                    );
                    const featureFlagGet = vi.fn(
                        async ({
                            featureFlagId,
                        }: {
                            featureFlagId: FeatureFlags;
                        }) => ({
                            enabled:
                                featureFlagId ===
                                FeatureFlags.PreviewSsoCredentialSync,
                        }),
                    );
                    Object.assign(f.service, {
                        checkGoogleRefreshToken: checkRefreshToken,
                        featureFlagModel: { get: featureFlagGet },
                    });
                    let stored: CreateWarehouseCredentials = stale;
                    const readBinding = vi.fn<
                        ProjectModel['getWarehouseCredentialsForBinding']
                    >(async (projectUuid) =>
                        projectUuid === 'upstream-uuid' ? upstream : stored,
                    );
                    const getPreviewOwnsCredentials = vi.fn(async () => false);
                    const updateIf = vi.fn<
                        ProjectModel['updateWarehouseCredentialsIf']
                    >(async (_projectUuid, update) => {
                        const next = update(stored);
                        if (next) stored = next;
                        return next !== null;
                    });
                    Object.assign(f.projectModel, {
                        getWarehouseCredentialsForBinding: readBinding,
                        getPreviewOwnsCredentials,
                        updateWarehouseCredentialsIf: updateIf,
                    });
                    const repair = vi.spyOn(
                        f.service as unknown as {
                            repairStalePreviewSsoCredentials: ProjectService['repairStalePreviewSsoCredentials'];
                        },
                        'repairStalePreviewSsoCredentials',
                    );
                    const expected = {
                        ...stale,
                        keyfileContents: rejected
                            ? upstream.keyfileContents
                            : stale.keyfileContents,
                    };
                    f.project.dbtConnection = { type: DbtProjectType.NONE };
                    vi.mocked(
                        warehouseClientFromCredentials,
                    ).mockImplementation((credentials) => ({
                        ...warehouseClientMock,
                        credentials,
                    }));
                    const probe = f.service as unknown as {
                        withCompileAdapter: ProjectService['withCompileAdapter'];
                    };
                    await probe.withCompileAdapter(
                        f.project.projectUuid,
                        user,
                        async ({ connection, warehouseCredentials }) => {
                            expect(
                                connection.connectionCredentials,
                            ).toMatchObject({
                                ...expected,
                                keyfileContents: {
                                    ...expected.keyfileContents,
                                    client_secret:
                                        lightdashConfigMock.auth.google
                                            .oauth2ClientSecret,
                                },
                            });
                            expect(warehouseCredentials).toMatchObject(
                                expected,
                            );
                        },
                        [],
                    );
                    expect(repair).toHaveBeenCalledExactlyOnceWith(
                        f.project.projectUuid,
                        stale,
                    );
                    expect(
                        f.projectModel.getSummary,
                    ).toHaveBeenCalledExactlyOnceWith(f.project.projectUuid);
                    expect(featureFlagGet).toHaveBeenCalledWith({
                        user: { organizationUuid: f.project.organizationUuid },
                        featureFlagId: FeatureFlags.PreviewSsoCredentialSync,
                    });
                    expect(
                        getPreviewOwnsCredentials,
                    ).toHaveBeenCalledExactlyOnceWith(f.project.projectUuid);
                    expect(readBinding).toHaveBeenCalledWith('upstream-uuid', {
                        kind: 'original',
                    });
                    expect(checkRefreshToken.mock.calls).toEqual(
                        rejected
                            ? [
                                  [stale.keyfileContents],
                                  [upstream.keyfileContents],
                              ]
                            : [[stale.keyfileContents]],
                    );
                    expect(updateIf).toHaveBeenCalledTimes(rejected ? 1 : 0);
                    if (rejected) {
                        expect(updateIf).toHaveBeenCalledWith(
                            f.project.projectUuid,
                            expect.any(Function),
                            'token_sync',
                        );
                        const update = updateIf.mock.calls[0][1];
                        expect(update(stale)).toEqual(expected);
                        expect(update(upstream)).toBeNull();
                    }
                    expect(stored).toEqual(expected);
                    expect(
                        warehouseClientFromCredentials,
                    ).toHaveBeenCalledExactlyOnceWith(
                        expect.objectContaining({
                            ...expected,
                            keyfileContents: {
                                ...expected.keyfileContents,
                                client_secret:
                                    lightdashConfigMock.auth.google
                                        .oauth2ClientSecret,
                            },
                        }),
                        expect.any(Object),
                    );
                },
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

    it.each([true, false])(
        'loads and refreshes each compile group once through the service with switch %s',
        async (enabled) => {
            const f = setup(snowflake(), { enabled });
            f.project.organizationUuid = 'different-project-organization';
            const installationLookup = vi.spyOn(
                f.service as unknown as {
                    resolveDbtConnectionInstallationId: ProjectService['resolveDbtConnectionInstallationId'];
                },
                'resolveDbtConnectionInstallationId',
            );
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
            const actor = { ...user, organizationUuid: 'actor-organization' };
            const adapters: ProjectAdapter[] = [];
            const compiled = await probe.withCompileAdapter(
                f.project.projectUuid,
                actor,
                (primary) =>
                    probe.compileMultiConnectionProject({
                        projectUuid: f.project.projectUuid,
                        organizationUuid: actor.organizationUuid,
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
            expect(
                f.featureFlagModel.get.mock.calls.filter(
                    ([input]) =>
                        input.featureFlagId ===
                        FeatureFlags.DbtExplicitCredentials,
                ),
            ).toEqual([
                [
                    {
                        featureFlagId: FeatureFlags.DbtExplicitCredentials,
                        user: { organizationUuid: f.project.organizationUuid },
                    },
                ],
            ]);
            expect(installationLookup).toHaveBeenCalledTimes(3);
            for (const [, organizationUuid] of installationLookup.mock.calls) {
                expect(organizationUuid).toBe(actor.organizationUuid);
            }
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
    });
});

describe('strict personal overlay (agent-identity on)', () => {
    test('shape B: Databricks U2M row without a host is refused on query, compile and test-and-compile', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        vi.spyOn(f.service.featureFlagModel, 'get').mockImplementation(
            async ({ featureFlagId }) =>
                ({
                    enabled: featureFlagId === FeatureFlags.AgentIdentity,
                }) as never,
        );
        setUserFallback(f, '');
        await expect(f.prepare()).rejects.toThrow('Reconnect your credentials');
        expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
        expect(f.service.featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.AgentIdentity,
            user: {
                organizationUuid: f.project.organizationUuid,
                userUuid: user.userUuid,
            },
        });
    });

    test('compile fallback keeps the legacy token selection with the flag off', async () => {
        const f = setup({
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        });
        setUserFallback(f, '');
        await f.prepare();
        expect(
            f.userWarehouseCredentialsModel.findForProjectWithSecrets,
        ).toHaveBeenCalledWith(
            f.project.projectUuid,
            user.userUuid,
            WarehouseTypes.DATABRICKS,
            { strictPersonalOverlay: false },
        );
        expect(f.service.featureFlagModel.get).toHaveBeenCalledWith({
            featureFlagId: FeatureFlags.AgentIdentity,
            user: {
                organizationUuid: f.project.organizationUuid,
                userUuid: user.userUuid,
            },
        });
    });
});

describe('factory dbt target handoff to the real local adapter', () => {
    const reason =
        "BigQuery Application Default Credentials cannot be used to run dbt, because they use the server's own identity. Use a service account key or a person's sign-in instead.";
    const paths = ['compile', 'test-and-compile'] as const;
    type CompilePath = (typeof paths)[number];

    const setupTarget = (explicitCredentials: boolean) => {
        const f = setup(bigqueryAdc);
        f.project.dbtConnection = {
            type: DbtProjectType.DBT,
            project_dir: '/unused/dbt-project',
        };
        f.featureFlagModel.get.mockImplementation(
            async ({ featureFlagId }) => ({
                enabled:
                    featureFlagId === FeatureFlags.DbtExplicitCredentials &&
                    explicitCredentials,
            }),
        );
        const resolver: CredentialResolver<CreateBigqueryCredentials> = {
            validateOnSave: vi.fn(async (input) => ({
                connection: input.connection,
                stored: input.stored,
            })),
            resolve: vi.fn(async (input) => ({
                agentSignIn: null,
                clientCredentials: input.connection,
                clientOptions: {},
                cacheable: false,
            })),
            cacheKeyIdentity: vi.fn(() => ['dbt-target-test']),
            dispose: vi.fn(async () => undefined),
            toDbtTarget: vi.fn<
                CredentialResolver<CreateBigqueryCredentials>['toDbtTarget']
            >((_resolved, _connection, policy) =>
                policy.explicitCredentials
                    ? { kind: 'none', reason }
                    : {
                          kind: 'target',
                          target: bigqueryAdcTarget,
                          environment: {},
                      },
            ),
        };
        f.service.warehouseClientFactory.credentialResolvers.register(
            WarehouseTypes.BIGQUERY,
            BigqueryAuthenticationType.ADC,
            resolver,
        );
        vi.mocked(warehouseClientFromCredentials).mockImplementation(
            (credentials) => ({ ...warehouseClientMock, credentials }),
        );
        const writeProfile = vi.mocked(writeFileSync);
        const createDirectory = vi.spyOn(fs, 'mkdtempSync');
        const dbtTest = vi
            .spyOn(DbtCliClient.prototype, 'test')
            .mockResolvedValue(undefined);
        const probe = f.service as unknown as {
            withCompileAdapter: ProjectService['withCompileAdapter'];
            testProjectAdapter: ProjectService['testProjectAdapter'];
        };
        const run = async (compilePath: CompilePath, actor = user) => {
            let captured: {
                profile: string;
                environment: Record<string, string>;
            } | null = null;
            const capture = (adapter: ProjectAdapter) => {
                expect(adapter).toBeInstanceOf(
                    DbtLocalCredentialsProjectAdapter,
                );
                const local = adapter as DbtLocalCredentialsProjectAdapter;
                captured = {
                    profile: fs.readFileSync(
                        `${local.profilesDir}/profiles.yml`,
                        'utf8',
                    ),
                    environment: (local.dbtClient as DbtCliClient).environment,
                };
            };
            if (compilePath === 'compile') {
                await probe.withCompileAdapter(
                    f.project.projectUuid,
                    actor,
                    async ({ adapter }) => {
                        capture(adapter);
                        await adapter.test();
                    },
                    [],
                );
            } else {
                const tested = await probe.testProjectAdapter(
                    {
                        ...projectWithSensitiveFields,
                        dbtConnection: f.project.dbtConnection,
                        warehouseConnection: {
                            kind: 'stored',
                            projectUuid: f.project.projectUuid,
                            credentials: bigqueryAdc,
                        },
                    },
                    actor,
                    'project_update',
                    RequestMethod.WEB_APP,
                    f.project.projectUuid,
                    f.project.organizationUuid,
                );
                try {
                    capture(tested.adapter);
                } finally {
                    await tested.adapter.destroy();
                    await tested.lease.release();
                }
            }
            return captured;
        };
        return { ...f, resolver, writeProfile, createDirectory, dbtTest, run };
    };

    afterEach(() => vi.unstubAllEnvs());

    it.each(paths)(
        '%s flag off preserves ambient profile bytes and environment at the adapter',
        async (compilePath) => {
            const f = setupTarget(false);
            const legacy = profileFromCredentials(bigqueryAdc, '/tmp/profiles');
            expect(await f.run(compilePath)).toEqual({
                profile: legacy.profile,
                environment: legacy.environment,
            });
            expect(f.dbtTest).toHaveBeenCalledOnce();
            expect(f.writeProfile).toHaveBeenCalledWith(
                expect.stringMatching(/profiles\.yml$/),
                legacy.profile,
            );
            expect(f.resolver.resolve).toHaveBeenCalledOnce();
        },
    );

    it.each(paths)(
        '%s flag off obtains its target from the resolver using the project organization',
        async (compilePath) => {
            const f = setupTarget(false);
            await f.run(compilePath);
            expect(f.featureFlagModel.get).toHaveBeenCalledWith({
                user: { organizationUuid: f.project.organizationUuid },
                featureFlagId: FeatureFlags.DbtExplicitCredentials,
            });
            expect(f.resolver.toDbtTarget).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    clientCredentials: expect.objectContaining(bigqueryAdc),
                }),
                expect.objectContaining(bigqueryAdc),
                { explicitCredentials: false },
            );
        },
    );

    it('flag off keeps the actor credential context and resolves the project flag scope', async () => {
        const f = setupTarget(false);
        f.project.organizationUuid = 'different-project-organization';
        const acquire = vi.spyOn(
            f.service.warehouseClientFactory,
            'acquireWarehouseConnection',
        );

        await f.run('test-and-compile', {
            ...user,
            organizationUuid: 'actor-organization',
        });

        expect(f.projectModel.getSummary).not.toHaveBeenCalled();

        expect(acquire).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            expect.objectContaining({
                organizationUuid: 'actor-organization',
            }),
        );
        expect(
            f.featureFlagModel.get.mock.calls.filter(
                ([input]) =>
                    input.featureFlagId === FeatureFlags.DbtExplicitCredentials,
            ),
        ).toEqual([
            [
                {
                    featureFlagId: FeatureFlags.DbtExplicitCredentials,
                    user: { organizationUuid: f.project.organizationUuid },
                },
            ],
        ]);
    });

    it.each(paths)(
        '%s serializes the resolver target and injects its environment',
        async (compilePath) => {
            const f = setupTarget(true);
            const target = {
                ...bigqueryAdcTarget,
                project: 'resolver-selected-project',
            };
            const environment = {
                LIGHTDASH_DBT_PROFILE_VAR_SENTINEL: 'resolver-owned-secret',
            };
            vi.mocked(f.resolver.toDbtTarget).mockReturnValue({
                kind: 'target',
                target,
                environment,
            });
            const result = await f.run(compilePath);
            expect(result).toEqual({
                profile: yaml.dump({
                    lightdash_profile: {
                        target: 'prod',
                        outputs: { prod: target },
                    },
                }),
                environment,
            });
            expect(f.resolver.toDbtTarget).toHaveBeenCalledOnce();
        },
    );

    it.each(paths)(
        '%s rejects resolver none before files or dbt despite host credentials',
        async (compilePath) => {
            CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS.forEach((key) =>
                vi.stubEnv(key, `host-${key}`),
            );
            const before = { ...process.env };
            const f = setupTarget(true);
            const outcome = await f.run(compilePath).then(
                () => ({ error: null }),
                (error: unknown) => ({ error }),
            );
            expect.soft(outcome.error).toBeInstanceOf(Error);
            expect
                .soft(
                    outcome.error instanceof Error
                        ? outcome.error.message
                        : null,
                )
                .toBe(reason);
            expect.soft(f.resolver.toDbtTarget).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    clientCredentials: expect.objectContaining(bigqueryAdc),
                }),
                expect.objectContaining(bigqueryAdc),
                { explicitCredentials: true },
            );
            expect.soft(f.writeProfile).not.toHaveBeenCalled();
            expect.soft(f.createDirectory).not.toHaveBeenCalled();
            expect.soft(f.dbtTest).not.toHaveBeenCalled();
            expect.soft(execa).not.toHaveBeenCalled();
            expect.soft(f.resolver.dispose).toHaveBeenCalledOnce();
            expect(process.env).toEqual(before);
        },
    );
});
