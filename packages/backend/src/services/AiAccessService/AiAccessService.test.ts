import { Ability } from '@casl/ability';
import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    ForbiddenError,
    QueryExecutionContext,
    QueryHistoryStatus,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
    type QueryHistory,
} from '@lightdash/common';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { AiAccessService, type ResolvePlanArgs } from './AiAccessService';
import {
    aiAgentMarkerMock,
    aiExecutionPlanMock,
    markedPersonPlanMock,
} from './AiAccessService.mock';
import {
    AiSessionFailureReason,
    type AiCredentialProvider,
    type AiMintedCredentials,
    type AiSessionProbeResult,
} from './providers/AiCredentialProvider';
import { createAiCredentialProviderRegistry } from './providers/registry';
import { SnowflakeAiCredentialProvider } from './providers/SnowflakeAiCredentialProvider';

const connection: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    user: 'connection',
    password: 'test',
    dbname: 'test',
    schema: 'public',
};
const snowflake: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'person',
    password: 'test',
    database: 'test',
    warehouse: 'test',
    schema: 'public',
};

const args: ResolvePlanArgs = {
    projectUuid: 'project',
    organizationUuid: 'org',
    warehouseConnectionUuid: null,
    connection,
    context: QueryExecutionContext.AI,
    userUuid: 'user',
    isRegisteredUser: true,
    isServiceAccount: false,
};
const account = buildAccount();
account.user.ability = new Ability<PossibleAbilities>([
    { action: 'manage', subject: 'Project' },
]);
const viewer = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { action: 'view', subject: 'Project' },
        ]),
    },
};

const setup = () => {
    const provider = {
        warehouseType: WarehouseTypes.SNOWFLAKE,
        configurationError: vi.fn((): string | null => null),
        missingPrerequisite: vi.fn(
            async (): Promise<AiAccessRefusalReason | null> => null,
        ),
        mint: vi.fn(
            async (): Promise<
                AiMintedCredentials<CreateWarehouseCredentials>
            > => ({
                identityUuid: 'agent-credential',
                credentials: snowflake,
                assurances: [{ kind: 'agent_session_active' }],
                expiresAt: null,
            }),
        ),
        probe: vi.fn(
            async (): Promise<AiSessionProbeResult> => ({
                ok: true,
                checkedAt: new Date(),
                observed: {},
            }),
        ),
    } satisfies AiCredentialProvider;
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const projects = {
        getSummary: vi.fn(async () => ({ organizationUuid: 'org' })),
        getWarehouseCredentialsForBinding: vi.fn(
            async (): Promise<CreateWarehouseCredentials> => connection,
        ),
    };
    const connections = {
        getProject: vi.fn(async () => ({ projectUuid: 'project' })),
        getCredentials: vi.fn(
            async (): Promise<CreateWarehouseCredentials> => connection,
        ),
    };
    const historyModel = {
        getDuckdbExecution: vi.fn().mockResolvedValue(null),
        get: vi.fn(),
    };
    const registry = vi.fn((): AiCredentialProvider => provider);
    const organizationSettings = {
        get: vi.fn(async () => ({ requireVerifiedAgentSessions: true })),
        upsert: vi.fn(
            async (
                _organizationUuid: string,
                settings: { requireVerifiedAgentSessions: boolean },
            ) => settings,
        ),
    };
    const service = new AiAccessService({
        organizationAgentIdentitySettingsModel:
            organizationSettings as unknown as OrganizationAgentIdentitySettingsModel,
        lightdashConfig: {} as LightdashConfig,
        featureFlagModel: flags as unknown as FeatureFlagModel,
        projectModel: projects as unknown as ProjectModel,
        queryHistoryModel: historyModel as unknown as QueryHistoryModel,
        warehouseConnectionModel:
            connections as unknown as WarehouseConnectionModel,
        userModel: {
            getUserDetailsByUuid: vi.fn(async () => ({
                email: 'a.b+tag@example.test',
            })),
        } as unknown as UserModel,
        providerRegistry: registry,
    });
    return {
        service,
        historyModel,
        organizationSettings,
        provider,
        flags,
        registry,
        projects,
        connections,
    };
};

describe('AiAccessService', () => {
    describe('stored result provenance', () => {
        const history = (
            credential?: string,
            context = QueryExecutionContext.EXPLORE,
        ) =>
            ({
                status: QueryHistoryStatus.READY,
                context,
                warehouseConnectionUuid: null,
                requestParameters: { aiSignInCredentialUuid: credential },
            }) as QueryHistory;

        test.each([undefined, 'agent-credential'])(
            'checks Snowflake lineage on a composed result with source %s',
            async (credential) => {
                const { service, historyModel, connections } = setup();
                connections.getCredentials.mockResolvedValue(snowflake);
                historyModel.getDuckdbExecution.mockImplementation(
                    async (uuid) =>
                        uuid === 'composed'
                            ? { references: { source: 'source' } }
                            : null,
                );
                historyModel.get.mockResolvedValue({
                    ...history(credential),
                    queryUuid: 'source',
                    warehouseConnectionUuid: 'extra',
                });
                const reading = service.assertCanReadResults(
                    account,
                    'project',
                    { ...history(credential), queryUuid: 'composed' },
                );
                if (credential) {
                    await expect(reading).resolves.toMatchObject({
                        identity: 'connected_person',
                    });
                } else {
                    await expect(reading).rejects.toMatchObject({
                        refusal: {
                            reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                        },
                    });
                }
            },
        );

        test('does not upgrade an old composed result when its source is re-run with an agent credential', async () => {
            const { service, historyModel, connections } = setup();
            connections.getCredentials.mockResolvedValue(snowflake);
            historyModel.getDuckdbExecution.mockImplementation(async (uuid) =>
                uuid === 'composed'
                    ? { references: { source: 'source' } }
                    : null,
            );
            historyModel.get.mockResolvedValue({
                ...history('agent-credential'),
                queryUuid: 'source',
                warehouseConnectionUuid: 'extra',
            });
            await expect(
                service.assertCanReadResults(account, 'project', {
                    ...history(),
                    queryUuid: 'composed',
                }),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                },
            });
        });

        test.each([undefined, 'old-credential'])(
            'refuses results from %s',
            async (credential) => {
                const { service, projects } = setup();
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    snowflake,
                );
                await expect(
                    service.assertCanReadResults(
                        account,
                        'project',
                        history(credential),
                    ),
                ).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                    },
                });
            },
        );

        test('reads only results from the current agent credential', async () => {
            const { service, projects, provider } = setup();
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            await expect(
                service.assertCanReadResults(
                    account,
                    'project',
                    history('agent-credential', QueryExecutionContext.AI),
                ),
            ).resolves.toMatchObject({
                identity: 'connected_person',
                identityUuid: 'agent-credential',
            });
            expect(provider.probe).toHaveBeenCalledOnce();
        });

        test('refuses previously agent-produced results after disconnect', async () => {
            const { service, projects, provider } = setup();
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            await expect(
                service.assertCanReadResults(
                    account,
                    'project',
                    history('agent-credential', QueryExecutionContext.AI),
                ),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                    action: 'sign_in',
                },
            });
        });

        test.each([WarehouseTypes.SNOWFLAKE, WarehouseTypes.POSTGRES])(
            'keeps marked-person reads for %s',
            async (type) => {
                const { service, projects, organizationSettings, provider } =
                    setup();
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    type === WarehouseTypes.SNOWFLAKE ? snowflake : connection,
                );
                organizationSettings.get.mockResolvedValue({
                    requireVerifiedAgentSessions: false,
                });
                await expect(
                    service.assertCanReadResults(account, 'project', history()),
                ).resolves.toMatchObject({ identity: 'marked_person' });
                expect(provider.mint).not.toHaveBeenCalled();
            },
        );

        test('checks the result connection rather than the project default', async () => {
            const { service, connections } = setup();
            connections.getCredentials.mockResolvedValue(snowflake);
            await expect(
                service.assertCanReadResults(account, 'project', {
                    ...history(),
                    warehouseConnectionUuid: 'extra',
                }),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                },
            });
            expect(connections.getCredentials).toHaveBeenCalledWith(
                expect.anything(),
                'extra',
            );
        });
    });

    describe('organization agent identity', () => {
        const snowflakeArgs = { ...args, connection: snowflake };

        test('refuses without an agent credential when the organisation requires it', async () => {
            const { service, provider, organizationSettings, projects } =
                setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            provider.missingPrerequisite.mockResolvedValue(
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            expect(
                await service.getAiAccessForUser(snowflakeArgs),
            ).toMatchObject({
                requirementSource: 'organization',
                refusal: {
                    reason: 'needs_sign_in',
                    message:
                        'Connect your agent to the warehouse once so it can run as you.',
                },
            });
            await expect(
                service.resolvePlan(snowflakeArgs),
            ).rejects.toMatchObject({ refusal: { reason: 'needs_sign_in' } });
        });

        test('verifies a connected person plan while the organisation requires it', async () => {
            const { service, provider, organizationSettings } = setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            provider.mint.mockResolvedValue({
                identityUuid: 'agent-credential',
                credentials: snowflake,
                assurances: [{ kind: 'agent_session_active' }],
                expiresAt: null,
            });
            expect(await service.resolvePlan(snowflakeArgs)).toMatchObject({
                identity: 'connected_person',
                assurances: [{ kind: 'agent_session_active' }],
            });
            expect(provider.probe).toHaveBeenCalledOnce();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: false,
            });
            expect(await service.resolvePlan(snowflakeArgs)).toMatchObject({
                identity: 'marked_person',
            });
        });

        test.each([
            [true, null],
            [true, 'extra'],
            [false, null],
            [false, 'extra'],
        ] as const)(
            'uses only the organisation switch (%s) for Snowflake connection %s',
            async (orgEnabled, connectionUuid) => {
                const { service, organizationSettings, projects, connections } =
                    setup();
                organizationSettings.get.mockResolvedValue({
                    requireVerifiedAgentSessions: orgEnabled,
                });
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    snowflake,
                );
                connections.getCredentials.mockResolvedValue(snowflake);
                expect(
                    await service.getMyAccess(
                        viewer,
                        'project',
                        connectionUuid,
                    ),
                ).toMatchObject({
                    requirementSource: orgEnabled ? 'organization' : null,
                    identity: orgEnabled ? 'connected_person' : 'marked_person',
                    refusal: null,
                });
                expect(
                    await service.resolvePlan({
                        ...snowflakeArgs,
                        warehouseConnectionUuid: connectionUuid,
                    }),
                ).toMatchObject({
                    identity: orgEnabled ? 'connected_person' : 'marked_person',
                });
            },
        );

        test('ignores the organization setting for other warehouses', async () => {
            const { service, organizationSettings } = setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            expect(await service.resolvePlan(args)).toMatchObject({
                identity: 'marked_person',
            });
            expect(await service.getAiAccessForUser(args)).toMatchObject({
                requirementSource: null,
            });
            expect(organizationSettings.get).not.toHaveBeenCalled();
        });

        test('keeps the feature flag gate', async () => {
            const { service, flags, organizationSettings } = setup();
            organizationSettings.get.mockResolvedValue({
                requireVerifiedAgentSessions: true,
            });
            flags.get.mockResolvedValue({ enabled: false });
            expect(await service.resolvePlan(snowflakeArgs)).toBeNull();
            expect(
                await service.getAiAccessForUser(snowflakeArgs),
            ).toMatchObject({ enabled: false, requirementSource: null });
        });
    });

    test('marks non-Snowflake queries without minting credentials or isolating results', async () => {
        const { service, provider } = setup();
        const plan = await service.resolvePlan(args);
        expect(plan).toMatchObject({
            identity: 'marked_person',
            audit: {
                personUuid: args.userUuid,
                principalRef: 'a.b+tag@example.test',
                queryTags: { agent: 'true' },
            },
        });
        expect(plan).not.toHaveProperty('credentials');
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            principalKind: 'person',
            refusal: null,
        });
    });
    test('keeps external callers separate from registered users', async () => {
        const { service } = setup();
        const plan = await service.resolvePlan({
            ...args,
            isRegisteredUser: false,
            userUuid: 'external-person',
        });
        expect(plan).toMatchObject({
            identity: 'marked_person',
            audit: { personUuid: 'external-person', userUuid: null },
        });
    });
    test('reports marked identity for non-Snowflake connections', async () => {
        const { service } = setup();
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            enabled: true,
            identity: 'marked_person',
            refusal: null,
        });
    });
    test('restricts marker probes to project managers', async () => {
        const { service } = setup();
        const runQuery = vi.fn();
        await expect(
            service.testMarker(viewer, 'project', null, runQuery),
        ).rejects.toThrow(ForbiddenError);
        expect(runQuery).not.toHaveBeenCalled();
    });
    describe.each([WarehouseTypes.POSTGRES, WarehouseTypes.REDSHIFT] as const)(
        '%s identification marker',
        (type) => {
            test.each([
                ['true', 'lightdash-ai', true],
                [null, 'lightdash-ai', false],
                ['true', 'normal', false],
                [null, 'normal', false],
            ] as const)(
                'checks marker %s and application name %s',
                async (agent, applicationName, ok) => {
                    const { service, projects } = setup();
                    projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                        {
                            type,
                            host: 'localhost',
                            port: 5432,
                            user: 'connection',
                            password: 'test',
                            dbname: 'test',
                            schema: 'public',
                        },
                    );
                    const runQuery = vi.fn(async () => [
                        { agent, application_name: applicationName },
                    ]);
                    expect(
                        await service.testMarker(
                            account,
                            'project',
                            null,
                            runQuery,
                        ),
                    ).toMatchObject({
                        ok,
                        level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                        observed: { agent, application_name: applicationName },
                        message: ok
                            ? 'The query succeeded with agent tags sent through the listed channels. These tags identify queries; they do not enforce access.'
                            : 'The warehouse session did not report the expected agent marker.',
                    });
                    expect(runQuery).toHaveBeenCalledWith(
                        expect.stringContaining(
                            `current_setting('lightdash.agent', ${type === WarehouseTypes.POSTGRES})`,
                        ),
                    );
                },
            );
        },
    );
    test.each([true, false])(
        'reports request-bound channels when the Trino probe succeeds (%s)',
        async (succeeds) => {
            const { service, projects } = setup();
            projects.getWarehouseCredentialsForBinding.mockResolvedValue({
                type: WarehouseTypes.TRINO,
                host: 'localhost',
                port: 8080,
                http_scheme: 'http',
                user: 'agent',
                password: '',
                dbname: 'catalog',
                schema: 'public',
            });
            const runQuery = vi.fn(async () => {
                if (!succeeds) throw new Error('query failed');
                return [{ result: 1 }];
            });

            const result = await service.testMarker(
                account,
                'project',
                null,
                runQuery,
            );

            expect(result.ok).toBe(succeeds);
            expect(runQuery).toHaveBeenCalledWith('SELECT 1');
            if (succeeds) {
                expect(result.observed.channels).toBe(
                    'Client tag, Extra credential, User-Agent, SQL comment',
                );
                expect(result.message).toBe(
                    'The query carried the agent marker through the listed channels. Enforcement needs your access control plugin or policy to read it.',
                );
            }
        },
    );
    test('returns a failed marker result when the query fails', async () => {
        const { service } = setup();
        expect(
            await service.testMarker(account, 'project', null, async () => {
                throw new Error('secret');
            }),
        ).toMatchObject({ ok: false, observed: {} });
    });
    test('refuses embedded viewers distinctly from service accounts', async () => {
        const { service } = setup();
        await expect(
            service.resolvePlan({
                ...args,
                connection: snowflake,
                isRegisteredUser: false,
            }),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                message:
                    'AI access runs as a signed-in person. Embedded viewers cannot use it on this connection.',
            },
        });
    });
    test('gets access for the calling user with view permission', async () => {
        const { service } = setup();
        const getAccess = vi.spyOn(service, 'getAiAccessForUser');
        await service.getMyAccess(viewer, 'project', null);
        expect(getAccess).toHaveBeenCalledWith({
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            connection,
            organizationUuid: 'org',
            userUuid: viewer.user.id,
            isRegisteredUser: true,
            isServiceAccount: false,
        });
    });
    test('loads extra connection credentials in the project scope', async () => {
        const { service, connections, projects } = setup();
        const capabilities = await service.getCapabilities(
            account,
            'project',
            'extra',
        );
        expect(capabilities.marker).toEqual(aiAgentMarkerMock);
        expect(connections.getProject).toHaveBeenCalledWith('project');
        expect(connections.getCredentials).toHaveBeenCalledWith(
            { projectUuid: 'project' },
            'extra',
        );
        expect(
            projects.getWarehouseCredentialsForBinding,
        ).not.toHaveBeenCalled();
    });
    test('reports a missing agent connection without minting', async () => {
        const { service, provider } = setup();
        provider.missingPrerequisite.mockResolvedValue(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        expect(
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            }),
        ).toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                action: 'sign_in',
                message:
                    'Connect your agent to the warehouse once so it can run as you.',
                settingsUrl: null,
            },
        });
        expect(provider.missingPrerequisite).toHaveBeenCalledWith(
            expect.objectContaining({
                person: { userUuid: 'user', email: 'a.b+tag@example.test' },
            }),
        );
        expect(provider.mint).not.toHaveBeenCalled();
        expect(provider.probe).not.toHaveBeenCalled();
    });
    test.each([null, '/generalSettings/projectManagement/project/aiAccess'])(
        'links an admin refusal to organization warehouse credentials from %s',
        async (settingsUrl) => {
            const { service, provider } = setup();
            provider.missingPrerequisite.mockRejectedValue(
                new AiAccessRefusedError(
                    AiAccessRefusalReason.PRINCIPAL_FAILED,
                    {
                        settingsUrl,
                    },
                ),
            );
            expect(
                await service.getAiAccessForUser({
                    ...args,
                    connection: snowflake,
                }),
            ).toMatchObject({
                refusal: {
                    action: 'ask_admin',
                    settingsUrl: '/generalSettings/warehouseCredentials',
                },
            });
        },
    );
    test('does not check prerequisites separately when resolving a plan', async () => {
        const { service, provider } = setup();
        await service.resolvePlan(args);
        expect(provider.missingPrerequisite).not.toHaveBeenCalled();
    });
    test('registers Snowflake', () => {
        const registry = createAiCredentialProviderRegistry({
            lightdashConfig: lightdashConfigMock,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        });
        expect(registry(WarehouseTypes.SNOWFLAKE)).toBeInstanceOf(
            SnowflakeAiCredentialProvider,
        );
    });
    test.each([
        {
            plan: markedPersonPlanMock,
            userUuid: 'person-uuid',
            principalKind: 'person',
            principalRef: 'person@example.test',
        },
        {
            plan: aiExecutionPlanMock,
            userUuid: 'person-uuid',
            principalKind: 'person',
            principalRef: 'ai_shared',
        },
        {
            plan: {
                ...markedPersonPlanMock,
                audit: { ...markedPersonPlanMock.audit, userUuid: null },
            },
            userUuid: null,
            principalKind: 'person',
            principalRef: 'person@example.test',
        },
    ])(
        'logs an agent query for $plan.identity with user $userUuid',
        ({ plan, userUuid, principalKind, principalRef }) => {
            const { service } = setup();
            const logger = Logger.child({});
            const info = vi
                .spyOn(logger, 'info')
                .mockImplementation(() => logger);
            Object.assign(service, { logger });
            service.recordQuery({
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                plan,
                context: QueryExecutionContext.AI,
            });
            expect(info).toHaveBeenCalledExactlyOnceWith('Agent query', {
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                userUuid,
                identity: plan.identity,
                principalKind,
                principalRef,
                context: QueryExecutionContext.AI,
            });
        },
    );
    test('ignores non-AI contexts before checking flags', async () => {
        const { service, flags } = setup();
        expect(
            await service.resolvePlan({
                ...args,
                context: QueryExecutionContext.SQL_RUNNER,
            }),
        ).toBeNull();
        expect(flags.get).not.toHaveBeenCalled();
    });
    test('ignores a disabled flag', async () => {
        const { service, flags, organizationSettings } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.resolvePlan(args)).toBeNull();
        expect(organizationSettings.get).not.toHaveBeenCalled();
    });
    test('uses a virtual identity for the organisation rule and verifies every execution', async () => {
        const { service, provider } = setup();
        const first = await service.resolvePlan({
            ...args,
            connection: snowflake,
        });
        const second = await service.resolvePlan({
            ...args,
            connection: snowflake,
        });
        expect(first).toMatchObject({
            identity: 'connected_person',
            identityUuid: expect.any(String),
        });
        expect(second).toEqual(first);
        expect(first).not.toHaveProperty('principal');
        expect(provider.mint).toHaveBeenCalledTimes(2);
        expect(provider.probe).toHaveBeenCalledTimes(2);
        const other = await service.resolvePlan({
            ...args,
            connection: snowflake,
            userUuid: 'other',
        });
        expect(other).not.toEqual(first);
    });
    test('refuses an unverified Snowflake session with the admin action', async () => {
        const { service, provider } = setup();
        provider.probe.mockResolvedValue({
            ok: false,
            transient: false,
            checkedAt: new Date(),
            observed: {},
            reason: AiSessionFailureReason.NOT_AGENT_SESSION,
            message: 'Inactive session',
        });
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).rejects.toMatchObject({
            refusal: {
                reason: 'principal_failed',
                action: 'ask_admin',
                settingsUrl: '/generalSettings/warehouseCredentials',
            },
        });
    });
    test('does not register separate-principal providers', () => {
        const registry = createAiCredentialProviderRegistry({
            lightdashConfig: lightdashConfigMock,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        });
        for (const type of Object.values(WarehouseTypes).filter(
            (value) => value !== WarehouseTypes.SNOWFLAKE,
        ))
            expect(registry(type)).toBeNull();
    });
});
