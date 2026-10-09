import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DbtProjectType,
    FeatureFlags,
    JobStatusType,
    JobStepType,
    ProjectType,
    RequestMethod,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreateProject,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type SessionUser,
} from '@lightdash/common';
import {
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    SshTunnel,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { type ProjectAdapter } from '../../types';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { UserService } from '../UserService';
import { type CheckGoogleRefreshToken } from './previewBigquerySsoCredentials';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import {
    buildAccount,
    projectWithSensitiveFields,
    user,
} from './ProjectService.mock';

const { disconnect } = vi.hoisted(() => ({
    disconnect: vi.fn(async () => undefined),
}));
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
        this.connect = async () => credentials;
        this.disconnect = disconnect;
    }),
}));
vi.mock('../../projectAdapters/projectAdapter', () => ({
    projectAdapterFromConfig: vi.fn(),
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

const workerUser: SessionUser = {
    ...user,
    organizationUuid: projectWithSensitiveFields.organizationUuid,
    organizationName: 'organisation',
    organizationCreatedAt: new Date('2026-01-01'),
};
const createStop = new Error('stop after create credential testing');
const setup = (
    credentials: CreateWarehouseCredentials,
    {
        enabled = true,
        compileEnabled = true,
        organizationUuid = null,
        dbtType = DbtProjectType.NONE,
    }: {
        enabled?: boolean;
        compileEnabled?: boolean;
        organizationUuid?: string | null;
        dbtType?: DbtProjectType.NONE | DbtProjectType.DBT_CLOUD_IDE;
    } = {},
) => {
    const project = {
        ...projectWithSensitiveFields,
        warehouseConnection: credentials,
        organizationWarehouseCredentialsUuid: organizationUuid,
        dbtConnection:
            dbtType === DbtProjectType.NONE
                ? { type: DbtProjectType.NONE as const }
                : projectWithSensitiveFields.dbtConnection,
    };
    const projectModel = {
        ...singleRouteProjectModelMethods,
        getWithSensitiveFields: vi.fn(async () => project),
        getSummary: vi.fn(async () => project),
        getWarehouseCredentialsForProject: vi.fn(
            async () => project.warehouseConnection,
        ),
        getProjectWarehouseConfig: vi.fn(async () => ({
            organizationWarehouseCredentialsUuid: organizationUuid,
        })),
        getWarehouseClientFromCredentials: vi.fn<
            ProjectModel['getWarehouseClientFromCredentials']
        >((value, options) => warehouseClientFromCredentials(value, options)),
        rotateRefreshToken: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
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
    const organizationWarehouseCredentialsModel = {
        rotateRefreshToken: vi.fn(async () => undefined),
        getByUuidWithSensitiveData: vi.fn(async () => ({
            organizationUuid: workerUser.organizationUuid,
            credentials,
        })),
    };
    const userOAuthGrantsModel = {
        getRefreshToken: vi.fn(async () => 'submitted-user-refresh'),
    };
    const steps: JobStepType[] = [];
    const failedSteps: JobStepType[] = [];
    const jobModel = {
        create: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        setPendingJobsToSkipped: vi.fn(async () => undefined),
        tryJobStep: vi.fn(
            async <T>(
                _job: string,
                step: JobStepType,
                fn: () => Promise<T>,
            ): Promise<T> => {
                steps.push(step);
                if (step === JobStepType.CREATING_PROJECT) throw createStop;
                try {
                    return await fn();
                } catch (error) {
                    failedSteps.push(step);
                    throw error;
                }
            },
        ),
    };
    const analytics = { track: vi.fn() };
    const service = new ProjectService({
        refreshTokenRotation: { run: vi.fn() },
        lightdashConfig: {
            ...lightdashConfigMock,
            staticIp: '192.0.2.1',
            warehouseClient: {
                ...lightdashConfigMock.warehouseClient,
                resolveTestAndCompileCredentials: enabled,
                resolveCompileCredentials: compileEnabled,
            },
        },
        projectModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        jobModel,
        analytics,
        schedulerClient: {
            testAndCompileProject: vi.fn(async () => undefined),
        },
        adminNotificationService: {
            notifyConnectionSettingsChange: vi.fn(async () => undefined),
        },
        featureFlagModel: { get: vi.fn(async () => ({ enabled: false })) },
    } as unknown as ProjectServiceArguments);
    const resolve = vi.spyOn(
        service.warehouseClientFactory,
        'resolveWarehouseCredentials',
    );
    const acquire = vi.spyOn(
        service.warehouseClientFactory,
        'acquireWarehouseConnection',
    );
    return {
        service,
        project,
        projectModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        jobModel,
        steps,
        failedSteps,
        analytics,
        resolve,
        acquire,
        worker: () =>
            service.testAndCompileProject(
                workerUser,
                project.projectUuid,
                RequestMethod.WEB_APP,
                'worker-job',
            ),
        create: () =>
            service._create(
                workerUser,
                {
                    ...project,
                    organizationWarehouseCredentialsUuid:
                        organizationUuid ?? undefined,
                } as CreateProject,
                'create-job',
                RequestMethod.WEB_APP,
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

const adapterTest = vi.fn();
const destroy = vi.fn(async () => undefined);
beforeEach(() => {
    adapterTest.mockReset();
    vi.mocked(warehouseClientFromCredentials).mockReset();
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
            return { ...warehouseClientMock, credentials };
        },
    );
    adapterTest.mockImplementation(
        async (credentials: CreateWarehouseCredentials) => {
            if (
                (credentials.type === WarehouseTypes.SNOWFLAKE ||
                    credentials.type === WarehouseTypes.DATABRICKS) &&
                ![
                    'refreshed-access',
                    'exchanged-access',
                    'refreshed-snowflake',
                ].includes(credentials.token ?? '')
            ) {
                throw new Error('warehouse rejected stale token');
            }
        },
    );
    vi.mocked(projectAdapterFromConfig).mockImplementation(
        async (_dbt, _client, credentials) =>
            ({
                test: () => adapterTest(credentials),
                destroy,
                getLightdashProjectConfig: vi.fn(async () => ({})),
            }) as unknown as ProjectAdapter,
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
        name: 'Databricks U2M user fallback',
        credentials: {
            ...databricks(DatabricksAuthenticationType.OAUTH_U2M),
            refreshToken: undefined,
        },
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

describe('test-and-compile credential resolution', () => {
    describe.each([undefined, 'stale-access'])(
        'stored access token %s',
        (storedToken) => {
            it.each(authCases)(
                'worker resolves reloaded $name inside testing acquisition',
                async ({
                    name,
                    credentials,
                    token,
                    rotated,
                    organizationUuid,
                }) => {
                    const f = setup(
                        { ...credentials, token: storedToken },
                        { organizationUuid },
                    );
                    if (name.endsWith('user fallback')) setUserFallback(f);
                    await f.worker();
                    expect(adapterTest).toHaveBeenCalledExactlyOnceWith(
                        expect.objectContaining({
                            token,
                            refreshToken: rotated,
                        }),
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
                                    userUuid: workerUser.userUuid,
                                    isRegisteredUser: true,
                                    isServiceAccount: false,
                                    serviceAccountUuid: null,
                                    oauthClientId: null,
                                },
                            }),
                        }),
                    );
                    expect(f.acquire).toHaveBeenCalledWith(
                        expect.objectContaining({
                            kind: 'compile',
                            tunnelOptions: {
                                staticIp: '192.0.2.1',
                                probeForward: true,
                            },
                        }),
                        expect.any(Object),
                    );
                    expect(
                        f.jobModel.tryJobStep.mock.invocationCallOrder[0],
                    ).toBeLessThan(f.resolve.mock.invocationCallOrder[0]);
                    expect(f.steps).toEqual([JobStepType.TESTING_ADAPTOR]);
                    expect(f.failedSteps).toEqual([]);
                    expect(destroy).toHaveBeenCalledOnce();
                    expect(disconnect).toHaveBeenCalledOnce();
                    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
                        disconnect.mock.invocationCallOrder[0],
                    );
                    expect(
                        f.service.warehouseClientFactory.warehouseClients,
                    ).toEqual({});
                    if (organizationUuid) {
                        expect(
                            f.organizationWarehouseCredentialsModel
                                .rotateRefreshToken,
                        ).toHaveBeenCalledExactlyOnceWith(
                            organizationUuid,
                            'org-refresh',
                            rotated,
                        );
                        expect(
                            f.projectModel.rotateRefreshToken,
                        ).not.toHaveBeenCalled();
                    } else if (name.endsWith('user fallback')) {
                        expect(
                            f.userWarehouseCredentialsModel.rotateRefreshToken,
                        ).toHaveBeenCalledExactlyOnceWith(
                            'user-credential-uuid',
                            'user-refresh',
                            rotated,
                        );
                        expect(
                            refreshDatabricksOAuthToken,
                        ).toHaveBeenCalledExactlyOnceWith(
                            'workspace.databricks.com',
                            'user-client',
                            'user-refresh',
                            undefined,
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
                    } else {
                        expect(
                            f.projectModel.rotateRefreshToken,
                        ).not.toHaveBeenCalled();
                    }
                    expect(
                        f.userOAuthGrantsModel.getRefreshToken,
                    ).not.toHaveBeenCalled();
                    const endpoint =
                        credentials.type === WarehouseTypes.SNOWFLAKE
                            ? UserService.generateSnowflakeAccessToken
                            : refreshDatabricksOAuthToken;
                    expect(
                        vi.mocked(endpoint).mock.calls.length +
                            vi.mocked(exchangeDatabricksOAuthCredentials).mock
                                .calls.length,
                    ).toBe(1);
                },
            );
            it.each(authCases)(
                'switch off tests raw $name without refresh',
                async ({ credentials, organizationUuid }) => {
                    const raw = { ...credentials, token: storedToken };
                    const f = setup(raw, {
                        enabled: false,
                        organizationUuid,
                        dbtType: DbtProjectType.DBT_CLOUD_IDE,
                    });
                    await expect(f.worker()).rejects.toThrow(
                        storedToken
                            ? 'warehouse rejected stale token'
                            : 'OAuth access token is required',
                    );
                    expect(
                        warehouseClientFromCredentials,
                    ).toHaveBeenCalledExactlyOnceWith(raw, expect.any(Object));
                    expect(f.resolve).not.toHaveBeenCalled();
                    expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
                    expect(
                        exchangeDatabricksOAuthCredentials,
                    ).not.toHaveBeenCalled();
                    expect(
                        UserService.generateSnowflakeAccessToken,
                    ).not.toHaveBeenCalled();
                    expect(
                        f.projectModel.rotateRefreshToken,
                    ).not.toHaveBeenCalled();
                    expect(
                        f.organizationWarehouseCredentialsModel
                            .rotateRefreshToken,
                    ).not.toHaveBeenCalled();
                    expect(
                        f.userWarehouseCredentialsModel.rotateRefreshToken,
                    ).not.toHaveBeenCalled();
                    expect(f.failedSteps).toEqual([
                        JobStepType.TESTING_ADAPTOR,
                    ]);
                    expect(f.steps).toEqual([JobStepType.TESTING_ADAPTOR]);
                    expect(
                        f.jobModel.setPendingJobsToSkipped,
                    ).toHaveBeenCalledWith('worker-job');
                    expect(disconnect).toHaveBeenCalledOnce();
                    if (storedToken) {
                        expect(destroy).toHaveBeenCalledOnce();
                        expect(
                            destroy.mock.invocationCallOrder[0],
                        ).toBeLessThan(disconnect.mock.invocationCallOrder[0]);
                    }
                },
            );
        },
    );

    it.each(['refresh', 'construction', 'adapter test'])(
        'attributes %s failure to testing and never compiles',
        async (failure) => {
            const f = setup(snowflake(), {
                dbtType: DbtProjectType.DBT_CLOUD_IDE,
            });
            const error = new Error('controlled failure');
            if (failure === 'refresh')
                vi.mocked(
                    UserService.generateSnowflakeAccessToken,
                ).mockRejectedValueOnce(error);
            if (failure === 'construction')
                vi.mocked(
                    warehouseClientFromCredentials,
                ).mockImplementationOnce(() => {
                    throw error;
                });
            if (failure === 'adapter test')
                adapterTest.mockRejectedValueOnce(error);
            await expect(f.worker()).rejects.toThrow(
                failure === 'refresh'
                    ? 'Error refreshing snowflake token'
                    : 'controlled failure',
            );
            expect(f.steps).toEqual([JobStepType.TESTING_ADAPTOR]);
            expect(f.failedSteps).toEqual([JobStepType.TESTING_ADAPTOR]);
            expect(f.jobModel.update).toHaveBeenCalledWith('worker-job', {
                jobStatus: JobStatusType.ERROR,
            });
            expect(disconnect).toHaveBeenCalledTimes(
                failure === 'refresh' ? 0 : 1,
            );
            if (failure === 'adapter test') {
                expect(destroy).toHaveBeenCalledOnce();
                expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
                    disconnect.mock.invocationCallOrder[0],
                );
            }
        },
    );

    it.each([true, false])(
        'worker switch is independent of disabled compile resolution: %s',
        async (enabled) => {
            const f = setup(
                { ...snowflake(), token: 'stale-access' },
                { enabled, compileEnabled: false },
            );
            if (enabled) await f.worker();
            else
                await expect(f.worker()).rejects.toThrow(
                    'warehouse rejected stale token',
                );
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
        },
    );

    describe.each([true, false])('create with switch %s', (enabled) => {
        it.each(authCases)(
            'preserves already-resolved submitted $name without a second refresh',
            async ({ name, credentials, token, organizationUuid }) => {
                const f = setup(credentials, { enabled, organizationUuid });
                if (name.endsWith('user fallback')) {
                    setUserFallback(f);
                    f.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets.mockResolvedValue(
                        await f.userWarehouseCredentialsModel.findForProjectWithSecrets(
                            f.project.projectUuid,
                            workerUser.userUuid,
                            WarehouseTypes.DATABRICKS,
                        ),
                    );
                }
                await expect(f.create()).rejects.toBe(createStop);
                expect(adapterTest).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({ token }),
                );
                expect(f.resolve).not.toHaveBeenCalled();
                expect(
                    vi.mocked(UserService.generateSnowflakeAccessToken).mock
                        .calls.length +
                        vi.mocked(refreshDatabricksOAuthToken).mock.calls
                            .length +
                        vi.mocked(exchangeDatabricksOAuthCredentials).mock.calls
                            .length,
                ).toBe(1);
                expect(destroy).toHaveBeenCalledOnce();
                expect(disconnect).toHaveBeenCalledOnce();
                expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(
                    disconnect.mock.invocationCallOrder[0],
                );
            },
        );
    });

    describe.each([true, false])(
        'BigQuery preview repair with worker resolution %s',
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
                    await f.worker();
                    expect(adapterTest).toHaveBeenCalledExactlyOnceWith(
                        expect.objectContaining({
                            ...expected,
                            keyfileContents: {
                                ...expected.keyfileContents,
                                client_secret:
                                    lightdashConfigMock.auth.google
                                        .oauth2ClientSecret,
                            },
                        }),
                    );
                    expect(projectAdapterFromConfig).toHaveBeenCalledOnce();
                    expect(
                        vi.mocked(projectAdapterFromConfig).mock.calls[0][2],
                    ).toMatchObject({
                        ...expected,
                        keyfileContents: {
                            ...expected.keyfileContents,
                            client_secret:
                                lightdashConfigMock.auth.google
                                    .oauth2ClientSecret,
                        },
                    });
                    expect(disconnect).toHaveBeenCalledOnce();
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

    it('merges masked M2M secrets before form resolution and reloads saved secrets in the worker', async () => {
        const stored = {
            ...databricks(),
            refreshToken: undefined,
            oauthClientSecret: 'saved-client-secret',
        };
        const f = setup(stored);
        await f.service.updateAndScheduleAsyncWork(
            f.project.projectUuid,
            buildAccount(),
            {
                ...f.project,
                organizationWarehouseCredentialsUuid: undefined,
                warehouseConnection: { ...stored, oauthClientSecret: '' },
            },
            RequestMethod.WEB_APP,
        );
        expect(
            exchangeDatabricksOAuthCredentials,
        ).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'project-client',
            'saved-client-secret',
        );
        expect(f.projectModel.update).toHaveBeenCalledWith(
            f.project.projectUuid,
            expect.objectContaining({
                warehouseConnection: expect.objectContaining({
                    token: 'exchanged-access',
                    oauthClientSecret: 'saved-client-secret',
                }),
            }),
            workerUser.userUuid,
        );
        f.project.warehouseConnection = {
            ...stored,
            token: 'reloaded-stale',
            refreshToken: 'reloaded-refresh',
        };
        await f.worker();
        expect(refreshDatabricksOAuthToken).toHaveBeenCalledExactlyOnceWith(
            'workspace.databricks.com',
            'project-client',
            'reloaded-refresh',
            'saved-client-secret',
        );
        expect(adapterTest).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ token: 'refreshed-access' }),
        );
        expect(
            f.projectModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            f.project.projectUuid,
            'reloaded-refresh',
            'rotated-refresh',
        );
    });

    it('worker reloads organisation credentials after submitted form resolution', async () => {
        const f = setup(
            { ...snowflake(), refreshToken: 'org-refresh' },
            { organizationUuid: 'org-credential-uuid' },
        );
        vi.mocked(
            UserService.generateSnowflakeAccessToken,
        ).mockResolvedValueOnce({
            accessToken: 'form-access',
            refreshToken: 'form-refresh',
        });
        const internals = f.service as unknown as {
            _resolveWarehouseClientCredentials: <
                T extends {
                    warehouseConnection: CreateWarehouseCredentials;
                    organizationWarehouseCredentialsUuid?: string;
                },
            >(
                data: T,
                userUuid: string,
                organizationUuid: string,
            ) => Promise<T>;
        };
        const resolved = await internals._resolveWarehouseClientCredentials(
            {
                warehouseConnection: snowflake(),
                organizationWarehouseCredentialsUuid: 'org-credential-uuid',
            },
            workerUser.userUuid,
            workerUser.organizationUuid!,
        );
        expect(resolved.warehouseConnection).toMatchObject({
            token: 'form-access',
        });
        f.project.warehouseConnection = {
            ...snowflake(),
            token: 'org-reloaded-stale',
            refreshToken: 'org-reloaded-refresh',
        };
        vi.mocked(
            UserService.generateSnowflakeAccessToken,
        ).mockResolvedValueOnce({
            accessToken: 'refreshed-snowflake',
            refreshToken: 'worker-rotated-refresh',
        });
        await f.worker();
        expect(f.projectModel.getWithSensitiveFields).toHaveBeenCalledWith(
            f.project.projectUuid,
        );
        expect(
            UserService.generateSnowflakeAccessToken,
        ).toHaveBeenLastCalledWith('org-reloaded-refresh');
        expect(
            f.organizationWarehouseCredentialsModel.rotateRefreshToken,
        ).toHaveBeenCalledExactlyOnceWith(
            'org-credential-uuid',
            'org-reloaded-refresh',
            'worker-rotated-refresh',
        );
        expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
    });
});
