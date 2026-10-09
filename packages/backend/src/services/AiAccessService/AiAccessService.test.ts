import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    BigqueryAuthenticationType,
    buildAgentIdentityClaim,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    getAiExecutionCredentialUuid,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySurface,
    SnowflakeAuthenticationType,
    UnexpectedServerError,
    WarehouseTypes,
    type AiIdentitySource,
    type AiServiceAccountSlot,
    type CreateWarehouseCredentials,
    type OrganizationAgentIdentityRule,
    type PossibleAbilities,
    type QueryHistory,
    type UpdateOrganizationAgentIdentityRule,
} from '@lightdash/common';
import refresh from 'passport-oauth2-refresh';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { fromServiceAccount } from '../../auth/account/account';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    type AiServiceAccountCredentialsModel,
    type AiServiceAccountSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationAgentIdentityRulesModel } from '../../models/OrganizationAgentIdentityRulesModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    type QueryHistoryModel,
    type QueryHistoryWithLineage,
} from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type UserModel } from '../../models/UserModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { sessionUser } from '../UserService.mock';
import { agentExecutionContext } from './agentExecutionContext';
import { AiAccessService, type ResolvePlanArgs } from './AiAccessService';
import {
    aiAgentMarkerMock,
    aiExecutionPlanMock,
    aiServiceAccountPlanMock,
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
    evaluation: { kind: 'query', surface: QuerySurface.APP },
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

const setup = (agentResultIdentityCheckEnabled = true) => {
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
        getAllByOrganizationUuid: vi.fn(async () => [
            { projectUuid: 'project', warehouseType: WarehouseTypes.SNOWFLAKE },
        ]),
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
    Object.assign(historyModel, {
        getManyWithDuckdbExecutions: vi.fn(async (uuids: string[]) =>
            Promise.all(
                uuids.map(async (uuid) => ({
                    queryHistory: await historyModel.get(uuid),
                    execution: await historyModel.getDuckdbExecution(uuid),
                })),
            ),
        ),
    });
    const registry = vi.fn((): AiCredentialProvider => provider);
    const organizationSettings = {
        get: vi.fn(async () => ({ requireVerifiedAgentSessions: true })),
        upsert: vi.fn(
            async (
                _organizationUuid: string,
                settings: { requireVerifiedAgentSessions: boolean },
            ) => ({
                settings,
                previousSource: 'marked_person' as AiIdentitySource,
                changed: settings.requireVerifiedAgentSessions,
            }),
        ),
    };
    const credentials = {
        findAiCredentialWithSecrets: vi.fn(async () => ({
            uuid: 'agent-credential',
            expiresAt: new Date('2030-01-01T00:00:00Z'),
            credentials: { type: WarehouseTypes.SNOWFLAKE },
        })),
    };
    const analytics = { track: vi.fn<LightdashAnalytics['track']>() };
    const organizationRules = {
        get: vi.fn(
            async (
                _org: string,
                type: WarehouseTypes,
            ): Promise<UpdateOrganizationAgentIdentityRule> => ({
                source:
                    type === WarehouseTypes.SNOWFLAKE
                        ? 'agent_sign_in'
                        : 'marked_person',
            }),
        ),
        list: vi.fn(
            async (): Promise<OrganizationAgentIdentityRule[]> => [
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
            ],
        ),
        set: vi.fn(
            async (): Promise<{
                previousSource: AiIdentitySource;
                changed: boolean;
            }> => ({ previousSource: 'marked_person', changed: true }),
        ),
    };
    const slots = {
        findProjectsMissingSlot: vi.fn(
            async (): Promise<{ projectUuid: string; name: string }[]> => [],
        ),
        getSecrets: vi
            .fn<
                () => Promise<{
                    slot: AiServiceAccountSlot;
                    secrets: AiServiceAccountSecrets;
                } | null>
            >()
            .mockResolvedValue(null),
        getSlot: vi
            .fn<() => Promise<AiServiceAccountSlot | null>>()
            .mockResolvedValue(null),
    };
    const users = {
        getUserDetailsByUuid: vi.fn(async () => ({
            email: 'a.b+tag@example.test',
        })),
    };
    const service = new AiAccessService({
        aiServiceAccountCredentialsModel:
            slots as unknown as AiServiceAccountCredentialsModel,
        userWarehouseCredentialsModel:
            credentials as unknown as UserWarehouseCredentialsModel,
        analytics,
        organizationAgentIdentityRulesModel:
            organizationRules as unknown as OrganizationAgentIdentityRulesModel,
        organizationAgentIdentitySettingsModel:
            organizationSettings as unknown as OrganizationAgentIdentitySettingsModel,
        lightdashConfig: {
            ...lightdashConfigMock,
            ai: { ...lightdashConfigMock.ai, agentResultIdentityCheckEnabled },
            siteUrl: 'https://lightdash.example',
            license: {
                ...lightdashConfigMock.license,
                licenseKey: 'test-license',
            },
            auth: {
                ...lightdashConfigMock.auth,
                snowflakeAi: {
                    ...lightdashConfigMock.auth.snowflakeAi,
                    clientId: 'test-client',
                    clientSecret: 'test-secret',
                    authorizationEndpoint:
                        'https://snowflake.example/authorize',
                    tokenEndpoint:
                        'https://test-account.snowflakecomputing.com/token',
                },
            },
        } as LightdashConfig,
        featureFlagModel: flags as unknown as FeatureFlagModel,
        projectModel: projects as unknown as ProjectModel,
        queryHistoryModel: historyModel as unknown as QueryHistoryModel,
        warehouseConnectionModel:
            connections as unknown as WarehouseConnectionModel,
        userModel: users as unknown as UserModel,
        providerRegistry: registry,
    });
    return {
        users,
        analytics,
        service,
        slots,
        historyModel,
        credentials,
        organizationSettings,
        organizationRules,
        provider,
        flags,
        registry,
        projects,
        connections,
    };
};

describe('AiAccessService', () => {
    test.each([
        [
            QueryExecutionContext.AI,
            QuerySurface.APP,
            null,
            false,
            AgentActorSurface.IN_APP_AGENT,
            'lightdash-chat',
        ],
        [
            QueryExecutionContext.MCP_RUN_SQL,
            QuerySurface.MCP,
            'OAuth.Client',
            false,
            AgentActorSurface.MCP,
            'OAuth.Client',
        ],
        [
            QueryExecutionContext.MCP_RUN_SQL,
            QuerySurface.MCP,
            null,
            false,
            AgentActorSurface.MCP,
            null,
        ],
        [
            QueryExecutionContext.AI,
            QuerySurface.CLI,
            null,
            false,
            AgentActorSurface.CLI,
            'lightdash-cli',
        ],
        [
            QueryExecutionContext.DATA_APP_SAMPLE,
            QuerySurface.APP,
            null,
            false,
            AgentActorSurface.DATA_APP,
            'lightdash-data-app',
        ],
        [
            QueryExecutionContext.MCP_RUN_SQL,
            QuerySurface.MCP,
            null,
            true,
            AgentActorSurface.MCP,
            null,
        ],
    ] as const)(
        'records both identities for %s on %s (%s, service account=%s)',
        async (
            context,
            surface,
            oauthClientId,
            isServiceAccount,
            actorSurface,
            clientId,
        ) => {
            const { service } = setup();
            const plan = await service.resolvePlan({
                ...args,
                context,
                evaluation: { kind: 'query', surface },
                oauthClientId,
                isServiceAccount,
                serviceAccountUuid: isServiceAccount ? 'service-account' : null,
            });
            expect(plan?.agentIdentity).toEqual(
                buildAgentIdentityClaim({
                    subject: {
                        type: isServiceAccount ? 'service_account' : 'user',
                        uuid: isServiceAccount ? 'service-account' : 'user',
                    },
                    surface: actorSurface,
                    clientId,
                }),
            );
        },
    );

    test.each([
        [AgentActorSurface.SLACK_AGENT, 'A123'],
        [AgentActorSurface.SLACK_AGENT, null],
        [AgentActorSurface.AI_SUMMARY, 'lightdash-ai-summary'],
    ] as const)(
        'uses async-scoped %s client %s only after enablement',
        async (surface, clientId) => {
            const { service, flags } = setup();
            await agentExecutionContext.run({ surface, clientId }, async () => {
                const plan = await service.resolvePlan(args);
                expect(plan?.agentIdentity).toEqual(
                    buildAgentIdentityClaim({
                        subject: { type: 'user', uuid: 'user' },
                        surface,
                        clientId,
                    }),
                );
                flags.get.mockResolvedValue({ enabled: false });
                expect(await service.resolvePlan(args)).toBeNull();
            });
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );

    test('ordinary CLI queries do not enter agent evaluation', async () => {
        const { service, flags } = setup();
        expect(
            await service.resolvePlan({
                ...args,
                context: QueryExecutionContext.CLI,
                evaluation: { kind: 'query', surface: QuerySurface.CLI },
            }),
        ).toBeNull();
        expect(flags.get).not.toHaveBeenCalled();
    });

    test('builds the chat claim after the existing flag check', async () => {
        const { service, flags, organizationRules } = setup();
        expect((await service.resolvePlan(args))?.agentIdentity).toEqual({
            sub: 'user:user',
            subject: { type: 'user', uuid: 'user' },
            act: {
                sub: 'in_app_agent:lightdash-chat',
                surface: 'in_app_agent',
                client_id: 'lightdash-chat',
            },
        });
        expect(flags.get).toHaveBeenCalledOnce();
        expect(organizationRules.get).toHaveBeenCalledOnce();
    });
    test('uses the service account UUID instead of its backing user', async () => {
        const { service } = setup();
        const plan = await service.resolvePlan({
            ...args,
            isServiceAccount: true,
            serviceAccountUuid: 'service-account',
        });
        expect(plan?.agentIdentity?.subject).toEqual({
            type: 'service_account',
            uuid: 'service-account',
        });
        expect(plan?.agentIdentity?.sub).toBe(
            'service_account:service-account',
        );
    });
    test('omits the claim and all model reads when the flag is off', async () => {
        const {
            service,
            flags,
            organizationRules,
            credentials,
            slots,
            projects,
            connections,
            historyModel,
            registry,
            users,
        } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.resolvePlan(args)).toBeNull();
        expect(flags.get).toHaveBeenCalledOnce();
        for (const model of [
            organizationRules,
            credentials,
            slots,
            projects,
            connections,
            historyModel,
            users,
        ]) {
            for (const method of Object.values(model))
                expect(method).not.toHaveBeenCalled();
        }
        expect(registry).not.toHaveBeenCalled();
    });
    test.each([QuerySurface.MCP, QuerySurface.SLACK, QuerySurface.API])(
        'records an explicit refusal actor for %s',
        (surface) => {
            const { service, analytics } = setup();
            service.trackQueryRefusal(
                {
                    ...args,
                    evaluation: { kind: 'query', surface },
                    warehouseType: WarehouseTypes.POSTGRES,
                },
                AiAccessRefusalReason.NEEDS_SIGN_IN,
            );
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        actor:
                            surface === QuerySurface.API
                                ? null
                                : {
                                      surface:
                                          surface === QuerySurface.MCP
                                              ? 'mcp'
                                              : 'slack_agent',
                                      clientId: null,
                                  },
                    }),
                }),
            );
        },
    );
    test('keeps a supplied actor client on the claim, log and refusal event', async () => {
        const { service, analytics } = setup();
        const agentActor = {
            surface: AgentActorSurface.MCP,
            clientId: 'oauth-client',
        };
        const plan = await service.resolvePlan({ ...args, agentActor });
        expect(plan?.agentIdentity?.act).toEqual({
            sub: 'mcp:oauth-client',
            surface: AgentActorSurface.MCP,
            client_id: 'oauth-client',
        });
        const info = vi
            .spyOn(service['logger'], 'info')
            .mockImplementation(() => service['logger']);
        service.recordQuery({
            queryUuid: 'query',
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            plan: plan!,
            context: args.context,
        });
        expect(info).toHaveBeenCalledWith(
            'Agent query',
            expect.objectContaining({
                actorSurface: AgentActorSurface.MCP,
                actorClientId: 'oauth-client',
            }),
        );
        info.mockRestore();
        service.trackQueryRefusal(
            { ...args, agentActor, warehouseType: connection.type },
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({ actor: agentActor }),
            }),
        );
    });
    test('does not misidentify an unknown service account as its backing user', async () => {
        const { service } = setup();
        expect(
            (await service.resolvePlan({ ...args, isServiceAccount: true }))
                ?.agentIdentity,
        ).toBeNull();
    });
    test('preserves an explicitly unknown refusal actor', () => {
        const { service, analytics } = setup();
        service.trackQueryRefusal(
            {
                ...args,
                agentActor: null,
                evaluation: { kind: 'query', surface: QuerySurface.MCP },
                warehouseType: connection.type,
            },
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({ actor: null }),
            }),
        );
    });
    describe('query refusal analytics', () => {
        const queryArgs: ResolvePlanArgs = { ...args, connection: snowflake };
        const properties = {
            organizationId: 'org',
            projectId: 'project',
            userId: 'user',
            warehouseConnectionId: null,
            surface: QuerySurface.APP,
            warehouseType: WarehouseTypes.SNOWFLAKE,
            actor: { surface: 'in_app_agent', clientId: 'lightdash-chat' },
        };

        test.each([
            AiAccessRefusalReason.SERVICE_ACCOUNT,
            AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            AiAccessRefusalReason.PRINCIPAL_FAILED,
            AiAccessRefusalReason.NEEDS_SIGN_IN,
            AiAccessRefusalReason.SIGN_IN_EXPIRED,
        ])('tracks %s with exact properties', async (reason) => {
            const { service, provider, analytics } = setup();
            if (reason === AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED) {
                provider.configurationError.mockReturnValue(
                    'private configuration',
                );
            } else if (reason === AiAccessRefusalReason.PRINCIPAL_FAILED) {
                provider.probe.mockResolvedValue({
                    ok: false,
                    transient: false,
                    checkedAt: new Date(),
                    observed: {},
                    reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                    message: 'private provider message',
                });
            } else {
                provider.mint.mockRejectedValue(
                    new AiAccessRefusedError(reason),
                );
            }
            const anonymous =
                reason === AiAccessRefusalReason.SERVICE_ACCOUNT ||
                reason === AiAccessRefusalReason.EMBED_NOT_SUPPORTED;
            await expect(
                service.resolvePlan({
                    ...queryArgs,
                    isServiceAccount:
                        reason === AiAccessRefusalReason.SERVICE_ACCOUNT,
                    isRegisteredUser:
                        reason !== AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
                }),
            ).rejects.toMatchObject({ refusal: { reason } });
            const event = {
                ...(anonymous
                    ? { anonymousId: LightdashAnalytics.anonymousId }
                    : { userId: 'user' }),
                event: 'query.refused',
                properties: {
                    ...properties,
                    userId: anonymous ? null : 'user',
                    reason,
                },
            };
            expect(analytics.track.mock.calls).toEqual([
                [event],
                ...(reason === AiAccessRefusalReason.SIGN_IN_EXPIRED
                    ? [
                          [
                              {
                                  ...event,
                                  event: 'agent_identity.expired',
                              },
                          ],
                      ]
                    : []),
            ]);
            expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
                /email|token|sql|private|example.test/i,
            );
        });

        test.each(['result_read', 'diagnostic'] as const)(
            'does not track %s refusals',
            async (kind) => {
                const { service, provider, analytics } = setup();
                provider.mint.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.SIGN_IN_EXPIRED,
                    ),
                );
                await expect(
                    service.resolvePlan({ ...queryArgs, evaluation: { kind } }),
                ).rejects.toBeInstanceOf(AiAccessRefusedError);
                expect(analytics.track).not.toHaveBeenCalled();
            },
        );

        test('uses the supplied surface and extra connection', async () => {
            const { service, provider, analytics } = setup();
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            await expect(
                service.resolvePlan({
                    ...queryArgs,
                    warehouseConnectionUuid: 'extra',
                    evaluation: { kind: 'query', surface: QuerySurface.SLACK },
                }),
            ).rejects.toBeInstanceOf(AiAccessRefusedError);
            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                userId: 'user',
                event: 'query.refused',
                properties: {
                    ...properties,
                    warehouseConnectionId: 'extra',
                    surface: QuerySurface.SLACK,
                    actor: { surface: 'slack_agent', clientId: null },
                    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
                },
            });
        });

        test('does not track untyped errors', async () => {
            const { service, provider, analytics } = setup();
            const error = new Error('secret token SQL');
            provider.mint.mockRejectedValue(error);
            await expect(service.resolvePlan(queryArgs)).rejects.toBe(error);
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test.each(['flag off', 'non-AI context', 'rule off'] as const)(
            'does not track with %s',
            async (condition) => {
                const { service, flags, organizationSettings, analytics } =
                    setup();
                if (condition === 'flag off')
                    flags.get.mockResolvedValue({ enabled: false });
                if (condition === 'rule off')
                    organizationSettings.get.mockResolvedValue({
                        requireVerifiedAgentSessions: false,
                    });
                await service.resolvePlan({
                    ...queryArgs,
                    context:
                        condition === 'non-AI context'
                            ? QueryExecutionContext.SQL_RUNNER
                            : QueryExecutionContext.AI,
                });
                expect(analytics.track).not.toHaveBeenCalled();
            },
        );

        test.each(['query.refused', 'agent_identity.expired'])(
            'keeps the expiry refusal and both track attempts when %s throws',
            async (failingEvent) => {
                const { service, provider, analytics } = setup();
                const refusal = new AiAccessRefusedError(
                    AiAccessRefusalReason.SIGN_IN_EXPIRED,
                );
                provider.mint.mockRejectedValue(refusal);
                analytics.track.mockImplementation((event) => {
                    if (event.event === failingEvent)
                        throw new Error('tracking failed');
                });
                await expect(
                    service.resolvePlan(queryArgs),
                ).rejects.toMatchObject({
                    refusal: {
                        ...refusal.refusal,
                        connectUrl:
                            'https://lightdash.example/agent/connect?project=project&redirect=%2Fagent-connected&entryPoint=chat_card',
                    },
                });
                expect(
                    analytics.track.mock.calls.map(([event]) => event.event),
                ).toEqual(['query.refused', 'agent_identity.expired']);
            },
        );

        test.each([false, true])(
            'keeps result guards silent after a query refusal (composed=%s)',
            async (composed) => {
                const {
                    service,
                    provider,
                    projects,
                    connections,
                    historyModel,
                    analytics,
                } = setup();
                provider.mint.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.SIGN_IN_EXPIRED,
                    ),
                );
                provider.missingPrerequisite.mockResolvedValue(
                    AiAccessRefusalReason.SIGN_IN_EXPIRED,
                );
                await expect(
                    service.resolvePlan(queryArgs),
                ).rejects.toBeInstanceOf(AiAccessRefusedError);
                const resolve = vi.spyOn(service, 'trackQueryRefusal');
                const history: QueryHistory = {
                    queryUuid: 'result',
                    status: QueryHistoryStatus.READY,
                    context: QueryExecutionContext.AI,
                    requestParameters: {},
                    warehouseConnectionUuid: null,
                } as QueryHistory;
                if (composed) {
                    connections.getCredentials.mockResolvedValue(snowflake);
                    historyModel.getDuckdbExecution.mockImplementation(
                        async (uuid) =>
                            uuid === 'result'
                                ? { references: { source: 'source' } }
                                : null,
                    );
                    historyModel.get.mockResolvedValue({
                        ...history,
                        queryUuid: 'source',
                        warehouseConnectionUuid: 'extra',
                    });
                } else {
                    projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                        snowflake,
                    );
                }
                const read = () =>
                    expect(
                        service.assertCanReadResults(
                            account,
                            'project',
                            history,
                        ),
                    ).rejects.toBeInstanceOf(AiAccessRefusedError);
                await read();
                await read();
                await read();
                await service.getAiAccessForUser(queryArgs);
                expect(resolve).toHaveBeenCalledTimes(3);
                for (const [resolvedArgs] of resolve.mock.calls)
                    expect(resolvedArgs.evaluation).toEqual({
                        kind: 'result_read',
                    });
                expect(
                    analytics.track.mock.calls.map(([event]) => event.event),
                ).toEqual(['query.refused', 'agent_identity.expired']);
            },
        );
    });

    describe('updateOrganizationSettings', () => {
        const admin = buildAccount();
        admin.user.ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'Organization' },
        ]);

        test.each([
            { previousRequired: false, required: true },
            { previousRequired: true, required: false },
        ])(
            'tracks $previousRequired -> $required once',
            async ({ previousRequired, required }) => {
                const { service, organizationSettings, analytics } = setup();
                const settings = { requireVerifiedAgentSessions: required };
                organizationSettings.upsert.mockResolvedValue({
                    settings,
                    changed: previousRequired !== required,
                    previousSource: previousRequired
                        ? 'agent_sign_in'
                        : 'marked_person',
                });
                await expect(
                    service.updateOrganizationSettings(admin, settings),
                ).resolves.toMatchObject(settings);
                expect(
                    organizationSettings.upsert,
                ).toHaveBeenCalledExactlyOnceWith(
                    admin.organization.organizationUuid,
                    settings,
                );
                expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                    userId: admin.user.id,
                    event: 'agent_identity.rule_updated',
                    properties: {
                        organizationId: admin.organization.organizationUuid,
                        userId: admin.user.id,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        source: required ? 'agent_sign_in' : 'marked_person',
                        previousSource: previousRequired
                            ? 'agent_sign_in'
                            : 'marked_person',
                    },
                });
                expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
                    /email|token|sql/i,
                );
            },
        );

        test.each([false, true])(
            'does not track an unchanged setting %s',
            async (required) => {
                const { service, organizationSettings, analytics } = setup();
                const settings = { requireVerifiedAgentSessions: required };
                organizationSettings.upsert.mockResolvedValue({
                    settings,
                    previousSource: required
                        ? 'agent_sign_in'
                        : 'marked_person',
                    changed: false,
                });
                await expect(
                    service.updateOrganizationSettings(admin, settings),
                ).resolves.toMatchObject(settings);
                expect(analytics.track).not.toHaveBeenCalled();
            },
        );

        test('uses the saved value to decide whether the rule changed', async () => {
            const { service, organizationSettings, analytics } = setup();
            const saved = { requireVerifiedAgentSessions: false };
            organizationSettings.upsert.mockResolvedValue({
                settings: saved,
                previousSource: 'marked_person' as AiIdentitySource,
                changed: false,
            });
            await expect(
                service.updateOrganizationSettings(admin, {
                    requireVerifiedAgentSessions: true,
                }),
            ).resolves.toMatchObject(saved);
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test('does not track denied access', async () => {
            const { service, organizationSettings, analytics } = setup();
            await expect(
                service.updateOrganizationSettings(viewer, {
                    requireVerifiedAgentSessions: true,
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(organizationSettings.upsert).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test('does not track a failed save', async () => {
            const { service, organizationSettings, analytics } = setup();
            organizationSettings.upsert.mockRejectedValue(
                new Error('save failed'),
            );
            await expect(
                service.updateOrganizationSettings(admin, {
                    requireVerifiedAgentSessions: true,
                }),
            ).rejects.toThrow('save failed');
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test('does not save or track with the flag off', async () => {
            const { service, organizationSettings, analytics, flags } = setup();
            flags.get.mockResolvedValue({ enabled: false });
            await expect(
                service.updateOrganizationSettings(admin, {
                    requireVerifiedAgentSessions: true,
                }),
            ).rejects.toMatchObject({ name: 'FeatureNotEnabledError' });
            expect(organizationSettings.upsert).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test('returns saved settings when tracking throws', async () => {
            const { service, analytics } = setup();
            analytics.track.mockImplementation(() => {
                throw new Error('tracking failed');
            });
            const settings = { requireVerifiedAgentSessions: true };
            await expect(
                service.updateOrganizationSettings(admin, settings),
            ).resolves.toMatchObject(settings);
            expect(analytics.track).toHaveBeenCalledTimes(1);
        });

        test.each(['jwt', 'service-account'])(
            'tracks a %s actor anonymously',
            async (actorType) => {
                const { service, analytics } = setup();
                const anonymous =
                    actorType === 'jwt'
                        ? buildAccount({ accountType: 'jwt' })
                        : fromServiceAccount(
                              {
                                  ...sessionUser,
                                  serviceAccount: {
                                      uuid: 'service-account-uuid',
                                  },
                              },
                              'test',
                          );
                anonymous.organization = admin.organization;
                anonymous.user.ability = admin.user.ability;
                await service.updateOrganizationSettings(anonymous, {
                    requireVerifiedAgentSessions: true,
                });
                expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                    anonymousId: LightdashAnalytics.anonymousId,
                    event: 'agent_identity.rule_updated',
                    properties: {
                        organizationId: anonymous.organization.organizationUuid,
                        userId: null,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        source: 'agent_sign_in',
                        previousSource: 'marked_person' as AiIdentitySource,
                    },
                });
                expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
                    /email|token|sql/i,
                );
            },
        );
    });

    describe('getAgentConnectPrompt', () => {
        const user = {
            ...sessionUser,
            organizationUuid: 'org',
            userUuid: 'user',
            ability: viewer.user.ability,
        };

        test('skips users without an organisation', async () => {
            const { service, flags } = setup();
            expect(
                await service.getAgentConnectPrompt({
                    ...user,
                    organizationUuid: undefined,
                }),
            ).toEqual({ required: false });
            expect(flags.get).not.toHaveBeenCalled();
        });

        test('skips when the flag is off', async () => {
            const { service, flags, organizationRules, projects } = setup();
            flags.get.mockResolvedValue({ enabled: false });
            expect(await service.getAgentConnectPrompt(user)).toEqual({
                required: false,
            });
            expect(flags.get).toHaveBeenCalledWith({
                user: { userUuid: 'user', organizationUuid: 'org' },
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(organizationRules.get).not.toHaveBeenCalled();
            expect(projects.getAllByOrganizationUuid).not.toHaveBeenCalled();
        });

        test('skips when the organisation rule is off', async () => {
            const { service, organizationRules, projects } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
            });
            expect(await service.getAgentConnectPrompt(user)).toEqual({
                required: false,
            });
            expect(projects.getAllByOrganizationUuid).not.toHaveBeenCalled();
        });

        test.each([
            { allProjects: [] },
            {
                allProjects: [
                    {
                        projectUuid: 'project',
                        warehouseType: WarehouseTypes.POSTGRES,
                    },
                ],
            },
        ])(
            'skips when no project uses Snowflake: %j',
            async ({ allProjects }) => {
                const { service, projects, provider } = setup();
                projects.getAllByOrganizationUuid.mockResolvedValue(
                    allProjects,
                );
                expect(await service.getAgentConnectPrompt(user)).toEqual({
                    required: false,
                });
                expect(provider.missingPrerequisite).not.toHaveBeenCalled();
                expect(
                    projects.getWarehouseCredentialsForBinding,
                ).not.toHaveBeenCalled();
            },
        );

        test('skips inaccessible Snowflake projects', async () => {
            const { service, provider } = setup();
            expect(
                await service.getAgentConnectPrompt({
                    ...user,
                    ability: new Ability<PossibleAbilities>([]),
                }),
            ).toEqual({ required: false });
            expect(provider.missingPrerequisite).not.toHaveBeenCalled();
        });

        test.each([
            AiAccessRefusalReason.NEEDS_SIGN_IN,
            AiAccessRefusalReason.SIGN_IN_EXPIRED,
        ])('prompts a project viewer for %s', async (reason) => {
            const { service, projects, provider, registry, analytics } =
                setup();
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            provider.missingPrerequisite.mockResolvedValue(reason);
            expect(await service.getAgentConnectPrompt(user)).toEqual({
                required: true,
                reason,
                projectUuid: 'project',
            });
            expect(projects.getAllByOrganizationUuid).toHaveBeenCalledWith(
                'org',
            );
            expect(analytics.track).not.toHaveBeenCalled();
            expect(registry).toHaveBeenCalledWith(WarehouseTypes.SNOWFLAKE);
            expect(provider.missingPrerequisite).toHaveBeenCalledWith({
                silentRefresh: true,
                connection: snowflake,
                person: { userUuid: 'user', email: user.email },
            });
        });

        test.each([null, AiAccessRefusalReason.PRINCIPAL_FAILED])(
            'skips when the provider reports %s',
            async (reason) => {
                const { service, provider } = setup();
                provider.missingPrerequisite.mockResolvedValue(reason);
                expect(await service.getAgentConnectPrompt(user)).toEqual({
                    required: false,
                });
            },
        );
    });

    test('returns stored expiry and principal name only for connected people', async () => {
        const { service, flags, organizationRules, credentials } = setup();
        expect(
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            }),
        ).toMatchObject({
            identity: 'connected_person',
            refusal: null,
            expiresAt: new Date('2030-01-01T00:00:00Z'),
            principalName: 'a.b+tag@example.test',
        });
        credentials.findAiCredentialWithSecrets.mockClear();
        organizationRules.get.mockResolvedValue({
            source: 'marked_person',
        });
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            identity: 'marked_person',
            expiresAt: null,
            principalName: null,
        });
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.getAiAccessForUser(args)).toMatchObject({
            identity: null,
            expiresAt: null,
            principalName: null,
        });
        expect(credentials.findAiCredentialWithSecrets).not.toHaveBeenCalled();
    });
    test.each(['me', 'capabilities', 'marker'] as const)(
        'rejects %s when agent identity is off',
        async (route) => {
            const { service, flags } = setup();
            flags.get.mockResolvedValue({ enabled: false });
            const runQuery = vi.fn();
            const requests = {
                me: () => service.getMyAccess(account, 'project', null),
                capabilities: () =>
                    service.getCapabilities(account, 'project', null),
                marker: () =>
                    service.testMarker(account, 'project', null, runQuery),
            };
            const result = requests[route]();
            await expect(result).rejects.toMatchObject({
                name: 'FeatureNotEnabledError',
                statusCode: 403,
                data: {
                    code: 'feature_not_enabled',
                    featureFlagId: FeatureFlags.AgentIdentity,
                },
            });
            expect(flags.get).toHaveBeenCalledWith({
                user: { userUuid: account.user.id, organizationUuid: 'org' },
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(runQuery).not.toHaveBeenCalled();
        },
    );

    describe('stored result provenance', () => {
        const history = (
            credential?: string | null,
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

        test.each([true, false])(
            'checks the source identity after a cross-warehouse rule change with result checks %s',
            async (enabled) => {
                const {
                    service,
                    historyModel,
                    connections,
                    organizationRules,
                } = setup(enabled);
                const trackRefusal = vi.spyOn(service, 'trackQueryRefusal');
                connections.getCredentials.mockResolvedValue(snowflake);
                historyModel.get.mockResolvedValue({
                    ...history('agent-credential', QueryExecutionContext.AI),
                    queryUuid: 'source',
                    warehouseConnectionUuid: 'extra',
                });
                const root: QueryHistoryWithLineage = {
                    ...history('agent-credential', QueryExecutionContext.AI),
                    queryUuid: 'composed',
                    duckdbExecutionReferences: { source: 'source' },
                };
                await expect(
                    service.assertCanReadResults(account, 'project', root),
                ).resolves.toMatchObject({ identity: 'connected_person' });

                organizationRules.get.mockResolvedValue({
                    source: 'marked_person',
                });
                trackRefusal.mockClear();
                const reading = service.assertCanReadResults(
                    account,
                    'project',
                    root,
                );
                if (enabled) {
                    await expect(reading).rejects.toMatchObject({
                        refusal: {
                            reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                        },
                    });
                    expect(trackRefusal).toHaveBeenCalledExactlyOnceWith(
                        expect.objectContaining({
                            warehouseConnectionUuid: 'extra',
                        }),
                        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                    );
                } else {
                    await expect(reading).resolves.toMatchObject({
                        identity: 'marked_person',
                    });
                    expect(trackRefusal).not.toHaveBeenCalled();
                }
            },
        );

        test.each(
            ['underlying data', 'warehouse rerun'].flatMap((kind) =>
                [true, false].flatMap((enabled) =>
                    [null, undefined].map((duckdbExecutionReferences) => ({
                        kind,
                        enabled,
                        duckdbExecutionReferences,
                    })),
                ),
            ),
        )(
            'checks warehouse $kind provenance after a rule change, enabled=$enabled execution=$duckdbExecutionReferences',
            async ({ kind, enabled, duckdbExecutionReferences }) => {
                const { service, historyModel, projects, organizationRules } =
                    setup(enabled);
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    snowflake,
                );
                const plan = await service.resolvePlan({
                    ...args,
                    connection: snowflake,
                });
                const source = {
                    ...history(null),
                    queryUuid: 'person-source',
                };
                historyModel.get.mockResolvedValue(source);
                const root: QueryHistoryWithLineage = {
                    ...history('agent-credential', QueryExecutionContext.AI),
                    queryUuid: 'warehouse-root',
                    duckdbExecutionReferences,
                    requestParameters: {
                        aiSignInCredentialUuid:
                            getAiExecutionCredentialUuid(plan),
                        ...(kind === 'underlying data'
                            ? {
                                  underlyingDataSourceQueryUuid:
                                      source.queryUuid,
                              }
                            : { references: { source: source.queryUuid } }),
                    } as QueryHistory['requestParameters'],
                };
                organizationRules.get.mockResolvedValue({
                    source: 'marked_person',
                });
                const reading = service.assertCanReadResults(
                    account,
                    'project',
                    root,
                );
                if (enabled) {
                    await expect(reading).rejects.toMatchObject({
                        refusal: {
                            reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                        },
                    });
                } else {
                    await expect(reading).resolves.toMatchObject({
                        identity: 'marked_person',
                    });
                }
                expect(historyModel.getDuckdbExecution.mock.calls).toEqual(
                    duckdbExecutionReferences === undefined
                        ? [['warehouse-root'], ['person-source']]
                        : [['person-source']],
                );
            },
        );

        test.each([true, false])(
            'checks a nested warehouse source with lineage after a rule change, enabled=%s',
            async (enabled) => {
                const { service, historyModel, projects, organizationRules } =
                    setup(enabled);
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    snowflake,
                );
                const plan = await service.resolvePlan({
                    ...args,
                    connection: snowflake,
                });
                const warehouseSource = {
                    ...history('agent-credential', QueryExecutionContext.AI),
                    queryUuid: 'warehouse-source',
                    requestParameters: {
                        aiSignInCredentialUuid:
                            getAiExecutionCredentialUuid(plan),
                        underlyingDataSourceQueryUuid: 'person-source',
                    },
                } as QueryHistory;
                const personSource = {
                    ...history(null),
                    queryUuid: 'person-source',
                };
                const batch = vi.fn(async (uuids: string[]) =>
                    uuids.map((uuid) => ({
                        queryHistory:
                            uuid === warehouseSource.queryUuid
                                ? warehouseSource
                                : personSource,
                        execution: null,
                    })),
                );
                Object.assign(historyModel, {
                    getManyWithDuckdbExecutions: batch,
                });
                organizationRules.get.mockResolvedValue({
                    source: 'marked_person',
                });
                const reading = service.assertCanReadResults(
                    account,
                    'project',
                    {
                        ...history(
                            'agent-credential',
                            QueryExecutionContext.AI,
                        ),
                        queryUuid: 'composed',
                        duckdbExecutionReferences: {
                            source: warehouseSource.queryUuid,
                        },
                    },
                );
                if (enabled) {
                    await expect(reading).rejects.toMatchObject({
                        refusal: {
                            reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                        },
                    });
                } else {
                    await expect(reading).resolves.toMatchObject({
                        identity: 'marked_person',
                    });
                }
                expect(batch.mock.calls.map(([uuids]) => uuids)).toEqual([
                    ['warehouse-source'],
                    ['person-source'],
                ]);
                expect(historyModel.getDuckdbExecution).not.toHaveBeenCalled();
            },
        );

        test.each([true, false])(
            'keeps a DuckDB result with a copied credential readable, projected provenance=%s',
            async (projected) => {
                const { service, historyModel, organizationRules } = setup();
                organizationRules.get.mockResolvedValue({
                    source: 'marked_person',
                });
                historyModel.get.mockResolvedValue({
                    ...history(null),
                    queryUuid: 'person-source',
                });
                const references = { source: 'person-source' };
                historyModel.getDuckdbExecution.mockImplementation(
                    async (uuid) =>
                        uuid === 'composed' ? { references } : null,
                );
                await expect(
                    service.assertCanReadResults(account, 'project', {
                        ...history(
                            'agent-credential',
                            QueryExecutionContext.AI,
                        ),
                        queryUuid: 'composed',
                        duckdbExecutionReferences: projected
                            ? references
                            : undefined,
                    }),
                ).resolves.toMatchObject({ identity: 'marked_person' });
                expect(historyModel.getDuckdbExecution.mock.calls).toEqual(
                    projected
                        ? [['person-source']]
                        : [['composed'], ['person-source']],
                );
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
            await service.resolvePlan({ ...args, connection: snowflake });
            await service.assertCanReadResults(
                account,
                'project',
                history('agent-credential', QueryExecutionContext.AI),
            );
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            await expect(
                service.resolvePlan({ ...args, connection: snowflake }),
            ).rejects.toMatchObject({
                refusal: { reason: AiAccessRefusalReason.NEEDS_SIGN_IN },
            });
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
                const { service, projects, organizationRules, provider } =
                    setup();
                projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                    type === WarehouseTypes.SNOWFLAKE ? snowflake : connection,
                );
                organizationRules.get.mockResolvedValue({
                    source: 'marked_person',
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
            const { service, provider, organizationRules, projects } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'agent_sign_in',
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
            const { service, provider, organizationRules } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'agent_sign_in',
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
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
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
            'uses the organisation rule (%s) for Snowflake connection %s',
            async (orgEnabled, connectionUuid) => {
                const { service, organizationRules, projects, connections } =
                    setup();
                organizationRules.get.mockResolvedValue({
                    source: orgEnabled ? 'agent_sign_in' : 'marked_person',
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
            const { service, organizationRules } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
            });
            expect(await service.resolvePlan(args)).toMatchObject({
                identity: 'marked_person',
            });
            expect(await service.getAiAccessForUser(args)).toMatchObject({
                requirementSource: null,
            });
            expect(organizationRules.get).toHaveBeenCalledWith(
                'org',
                WarehouseTypes.POSTGRES,
                'person',
            );
        });

        test('keeps the feature flag gate', async () => {
            const { service, flags, organizationRules } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'agent_sign_in',
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
    test.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.SIGN_IN_EXPIRED,
    ])('me returns the project connect link for %s', async (reason) => {
        const { service, provider, projects } = setup();
        projects.getWarehouseCredentialsForBinding.mockResolvedValue(snowflake);
        provider.missingPrerequisite.mockResolvedValue(reason);
        expect(
            await service.getMyAccess(viewer, 'project', null),
        ).toMatchObject({
            requirementSource: 'organization',
            expiresAt: null,
            principalName: null,
            refusal: {
                connectUrl:
                    'https://lightdash.example/agent/connect?project=project&redirect=%2Fagent-connected&entryPoint=unknown',
            },
        });
    });

    test.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.SIGN_IN_EXPIRED,
    ])(
        'resolvePlan includes the project connect link for %s',
        async (reason) => {
            const { service, provider } = setup();
            provider.mint.mockRejectedValue(new AiAccessRefusedError(reason));
            await expect(
                service.resolvePlan({ ...args, connection: snowflake }),
            ).rejects.toMatchObject({
                refusal: {
                    connectUrl:
                        'https://lightdash.example/agent/connect?project=project&redirect=%2Fagent-connected&entryPoint=chat_card',
                },
            });
        },
    );

    test.each([
        [QuerySurface.MCP, 'mcp_connect_link'],
        [QuerySurface.SLACK, 'slack_link'],
        [QuerySurface.APP, 'chat_card'],
        [QuerySurface.API, 'unknown'],
        [QuerySurface.CLI, 'unknown'],
    ] as const)(
        'attributes a %s query refusal to %s',
        async (surface, entryPoint) => {
            const { service, provider } = setup();
            provider.mint.mockRejectedValue(
                new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
            );
            await expect(
                service.resolvePlan({
                    ...args,
                    connection: snowflake,
                    evaluation: { kind: 'query', surface },
                }),
            ).rejects.toMatchObject({
                refusal: {
                    connectUrl: `https://lightdash.example/agent/connect?project=project&redirect=%2Fagent-connected&entryPoint=${entryPoint}`,
                },
            });
        },
    );

    test.each(
        Object.values(AiAccessRefusalReason).filter(
            (reason) =>
                reason !== AiAccessRefusalReason.NEEDS_SIGN_IN &&
                reason !== AiAccessRefusalReason.SIGN_IN_EXPIRED,
        ),
    )('leaves the connect URL null for %s', async (reason) => {
        const { service, provider } = setup();
        provider.missingPrerequisite.mockResolvedValue(reason);
        provider.mint.mockRejectedValue(new AiAccessRefusedError(reason));
        expect(
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            }),
        ).toMatchObject({ refusal: { reason, connectUrl: null } });
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).rejects.toMatchObject({ refusal: { reason, connectUrl: null } });
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
                connectUrl:
                    'https://lightdash.example/agent/connect?project=project&redirect=%2Fagent-connected&entryPoint=unknown',
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
                    settingsUrl: '/generalSettings/agentIdentity',
                    connectUrl: null,
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
            plan: aiServiceAccountPlanMock,
            userUuid: 'person-uuid',
            principalKind: 'service_account',
            principalRef: 'slot-row',
        },
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
                actorSurface: null,
                actorClientId: null,
                queryUuid: 'query',
                projectUuid: 'project',
                warehouseConnectionUuid: 'connection',
                userUuid,
                identity: plan.identity,
                actorKind: plan.audit.actorKind,
                credentialUuid:
                    plan.identity === 'ai_service_account'
                        ? plan.credentialUuid
                        : getAiExecutionCredentialUuid(plan),
                identityUuid:
                    plan.identity === 'marked_person'
                        ? null
                        : plan.identityUuid,
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
        const { service, flags, organizationRules } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        expect(await service.resolvePlan(args)).toBeNull();
        expect(organizationRules.get).not.toHaveBeenCalled();
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
                settingsUrl: '/generalSettings/agentIdentity',
                connectUrl: null,
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

describe('organization agent identity rules', () => {
    const manager = () => {
        const admin = buildAccount();
        admin.user.ability = new Ability<PossibleAbilities>([
            {
                action: 'manage',
                subject: 'Organization',
                conditions: {
                    organizationUuid: admin.organization.organizationUuid,
                },
            },
        ]);
        return admin;
    };

    test.each([true, false])(
        'lists missing projects only for organization managers: %s',
        async (canManage) => {
            const { service, organizationRules, slots } = setup();
            const member = canManage ? manager() : buildAccount();
            const missing = [
                { projectUuid: 'missing-project', name: 'Missing project' },
            ];
            organizationRules.list.mockResolvedValue([
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: 'agent_sign_in',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'ai_service_account',
                    projectsMissingAiServiceAccount: null,
                },
            ]);
            slots.findProjectsMissingSlot.mockResolvedValue(missing);
            const result = await service.getOrganizationSettings(member);
            expect(result.rules).toEqual([
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: 'agent_sign_in',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'ai_service_account',
                    projectsMissingAiServiceAccount: canManage ? missing : null,
                },
            ]);
            if (canManage)
                expect(
                    slots.findProjectsMissingSlot,
                ).toHaveBeenCalledExactlyOnceWith(
                    member.organization.organizationUuid,
                    WarehouseTypes.BIGQUERY,
                );
            else expect(slots.findProjectsMissingSlot).not.toHaveBeenCalled();
            expect(slots.getSecrets).not.toHaveBeenCalled();
        },
    );

    test('returns the legacy default and default enforceable rules', async () => {
        const { service, organizationSettings, organizationRules } = setup();
        const member = buildAccount();
        organizationSettings.get.mockResolvedValue({
            requireVerifiedAgentSessions: false,
        });
        expect(await service.getOrganizationSettings(member)).toEqual({
            requireVerifiedAgentSessions: false,
            rules: [
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
            ],
        });
        expect(organizationRules.list).toHaveBeenCalledWith(
            member.organization.organizationUuid,
        );
    });

    test.each([
        [WarehouseTypes.BIGQUERY, 'ai_service_account'],
        [WarehouseTypes.SNOWFLAKE, 'agent_sign_in'],
    ] as const)(
        'writes %s rules for the account organization',
        async (warehouseType, source) => {
            const { service, organizationRules, analytics } = setup();
            const admin = manager();
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
            });
            const rule = { source };
            expect(
                await service.updateOrganizationRule(
                    admin,
                    warehouseType,
                    rule,
                ),
            ).toEqual({
                warehouseType,
                ...rule,
                projectsMissingAiServiceAccount:
                    source === 'ai_service_account' ? [] : null,
            });
            expect(organizationRules.set).toHaveBeenCalledWith(
                admin.organization.organizationUuid,
                warehouseType,
                rule,
            );
            expect(organizationRules.get).not.toHaveBeenCalled();
            expect(analytics.track).toHaveBeenCalledTimes(1);
            expect(analytics.track).toHaveBeenCalledWith({
                event: 'agent_identity.rule_updated',
                userId: admin.user.id,
                properties: {
                    organizationId: admin.organization.organizationUuid,
                    userId: admin.user.id,
                    warehouseType,
                    source,
                    previousSource: 'marked_person',
                },
            });
        },
    );

    test.each([
        [WarehouseTypes.SNOWFLAKE, 'ai_service_account'],
        [WarehouseTypes.BIGQUERY, 'agent_sign_in'],
        [WarehouseTypes.POSTGRES, 'marked_person'],
        [WarehouseTypes.POSTGRES, 'agent_sign_in'],
        [WarehouseTypes.POSTGRES, 'ai_service_account'],
    ] as const)(
        'rejects %s source %s without writing',
        async (type, source) => {
            const {
                service,
                organizationRules,
                organizationSettings,
                analytics,
            } = setup();
            await expect(
                service.updateOrganizationRule(manager(), type, {
                    source,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(organizationRules.set).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
            expect(organizationSettings.upsert).not.toHaveBeenCalled();
        },
    );

    test('rejects a non-manager', async () => {
        const { service, organizationRules, analytics } = setup();
        await expect(
            service.updateOrganizationRule(
                buildAccount(),
                WarehouseTypes.BIGQUERY,
                { source: 'ai_service_account' },
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(organizationRules.set).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });

    test.each(['get', 'legacy', 'rule'] as const)(
        'gates %s before reading or writing settings',
        async (method) => {
            const {
                service,
                flags,
                organizationSettings,
                organizationRules,
                analytics,
            } = setup();
            flags.get.mockResolvedValue({ enabled: false });
            const admin = manager();
            const actions = {
                get: () => service.getOrganizationSettings(admin),
                legacy: () =>
                    service.updateOrganizationSettings(admin, {
                        requireVerifiedAgentSessions: true,
                    }),
                rule: () =>
                    service.updateOrganizationRule(
                        admin,
                        WarehouseTypes.BIGQUERY,
                        { source: 'ai_service_account' },
                    ),
            };
            await expect(actions[method]()).rejects.toBeInstanceOf(
                FeatureNotEnabledError,
            );
            expect(organizationRules.set).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
            expect(organizationRules.list).not.toHaveBeenCalled();
            expect(organizationSettings.upsert).not.toHaveBeenCalled();
            expect(organizationSettings.get).not.toHaveBeenCalled();
        },
    );

    test.each([true, false])(
        'delegates legacy %s to the atomic settings adapter and returns its overview',
        async (required) => {
            const {
                service,
                organizationRules,
                organizationSettings,
                analytics,
            } = setup();
            const admin = manager();
            const rules: OrganizationAgentIdentityRule[] = [
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: required ? 'agent_sign_in' : 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
            ];
            organizationRules.list.mockResolvedValue(rules);
            expect(
                await service.updateOrganizationSettings(admin, {
                    requireVerifiedAgentSessions: required,
                }),
            ).toEqual({ requireVerifiedAgentSessions: required, rules });
            expect(organizationSettings.upsert).toHaveBeenCalledWith(
                admin.organization.organizationUuid,
                { requireVerifiedAgentSessions: required },
            );
            expect(analytics.track).toHaveBeenCalledTimes(required ? 1 : 0);
        },
    );
    test('round 11 rule saves use transaction metadata and suppress the second event', async () => {
        const { service, organizationRules, analytics } = setup();
        const admin = manager();
        organizationRules.get.mockResolvedValue({ source: 'marked_person' });
        organizationRules.set
            .mockResolvedValueOnce({
                previousSource: 'ai_service_account',
                changed: true,
            } as never)
            .mockResolvedValueOnce({
                previousSource: 'marked_person',
                changed: false,
            } as never);
        await service.updateOrganizationRule(admin, WarehouseTypes.BIGQUERY, {
            source: 'marked_person',
        });
        await service.updateOrganizationRule(admin, WarehouseTypes.BIGQUERY, {
            source: 'marked_person',
        });
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    previousSource: 'ai_service_account',
                }),
            }),
        );
        expect(organizationRules.get).not.toHaveBeenCalled();
    });

    test('tracks the previous non-default rule after a successful update', async () => {
        const { service, organizationRules, analytics } = setup();
        const admin = manager();
        organizationRules.get.mockResolvedValue({
            source: 'ai_service_account',
        });
        organizationRules.set.mockImplementation(async () => {
            expect(analytics.track).not.toHaveBeenCalled();
            expect(organizationRules.get).not.toHaveBeenCalled();
            return { previousSource: 'ai_service_account', changed: true };
        });
        await service.updateOrganizationRule(admin, WarehouseTypes.BIGQUERY, {
            source: 'marked_person',
        });
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(analytics.track).toHaveBeenCalledWith({
            event: 'agent_identity.rule_updated',
            userId: admin.user.id,
            properties: {
                organizationId: admin.organization.organizationUuid,
                userId: admin.user.id,
                warehouseType: WarehouseTypes.BIGQUERY,
                source: 'marked_person',
                previousSource: 'ai_service_account',
            },
        });
        expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
            /saved-key|agent@example.com|keyfileContents|private_key|SELECT/,
        );
    });

    test('does not track a failed rule write', async () => {
        const { service, organizationRules, analytics } = setup();
        organizationRules.set.mockRejectedValue(new Error('write failed'));
        await expect(
            service.updateOrganizationRule(
                manager(),
                WarehouseTypes.SNOWFLAKE,
                { source: 'agent_sign_in' },
            ),
        ).rejects.toThrow('write failed');
        expect(analytics.track).not.toHaveBeenCalled();
    });
});

const bigquery: CreateWarehouseCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'current-project',
    dataset: 'current-dataset',
    timeoutSeconds: 0,
    priority: 'interactive',
    retries: 0,
    maximumBytesBilled: 0,
    location: 'EU',
    requireUserCredentials: true,
    allowUserCredentials: true,
    keyfileContents: {
        type: 'authorized_user',
        refresh_token: 'ordinary-token',
    },
};
const slot: AiServiceAccountSlot = {
    uuid: 'slot-row',
    identityUuid: 'slot-generation',
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    kind: 'ai_service_account',
    scope: 'connection',
    warehouseType: WarehouseTypes.BIGQUERY,
    method: 'private_key',
    createdByUserUuid: 'admin',
    updatedByUserUuid: 'admin',
    credentialSubjectUserUuid: null,
    createdAt: new Date('2026-10-08T00:00:00Z'),
    updatedAt: new Date('2026-10-08T00:00:00Z'),
};
const secrets: AiServiceAccountSecrets = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'saved-key',
        client_email: 'agent@example.com',
    },
};
const actorCases = [
    { actor: 'person', isRegisteredUser: true, isServiceAccount: false },
    {
        actor: 'service_account',
        isRegisteredUser: false,
        isServiceAccount: true,
    },
    { actor: 'embed', isRegisteredUser: false, isServiceAccount: false },
] as const;
const sourceCases = [
    { source: 'marked_person', connection: snowflake },
    { source: 'agent_sign_in', connection: snowflake },
    { source: 'marked_person', connection: bigquery },
    { source: 'ai_service_account', connection: bigquery },
] as const;
const resolutionCases = actorCases.flatMap((actor) =>
    sourceCases.flatMap((source) =>
        ['present', 'missing', 'unreadable'].map((state) => {
            let identity:
                | 'marked_person'
                | 'connected_person'
                | 'ai_service_account' = 'marked_person';
            let reason: AiAccessRefusalReason | null = null;
            if (source.source !== 'marked_person') {
                if (actor.actor === 'embed') {
                    reason = AiAccessRefusalReason.EMBED_NOT_SUPPORTED;
                } else if (source.source === 'agent_sign_in') {
                    if (actor.actor === 'service_account') {
                        reason = AiAccessRefusalReason.SERVICE_ACCOUNT;
                    } else if (state === 'missing') {
                        reason = AiAccessRefusalReason.NEEDS_SIGN_IN;
                    } else {
                        identity = 'connected_person';
                        if (state === 'unreadable')
                            reason = AiAccessRefusalReason.PRINCIPAL_FAILED;
                    }
                } else if (state === 'missing') {
                    reason = AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING;
                } else {
                    identity = 'ai_service_account';
                    if (state === 'unreadable')
                        reason =
                            AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID;
                }
            }
            return { ...actor, ...source, state, identity, reason };
        }),
    ),
);

describe('per-type execution identity resolution', () => {
    test.each([
        [QueryExecutionContext.AI, false],
        [QueryExecutionContext.AI, true],
        [QueryExecutionContext.MCP_RUN_SQL, false],
        [QueryExecutionContext.MCP_RUN_SQL, true],
    ] as const)(
        'always refuses a missing slot in %s for service account=%s',
        async (context, isServiceAccount) => {
            const { service, organizationRules, analytics, slots } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'ai_service_account',
            });
            const request = {
                ...args,
                connection: bigquery,
                context,
                isServiceAccount,
                isRegisteredUser: !isServiceAccount,
            };
            await expect(service.resolvePlan(request)).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                },
            });
            expect(analytics.track).toHaveBeenCalledTimes(1);
            expect(await service.getAiAccessForUser(request)).toMatchObject({
                requirementSource: 'organization',
                refusal: {
                    reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                },
            });
            expect(slots.getSecrets).toHaveBeenCalledTimes(1);
            expect(analytics.track).toHaveBeenCalledTimes(1);
        },
    );

    test.each(resolutionCases)(
        '$actor $connection.type $source state=$state',
        async (scenario) => {
            const {
                service,
                organizationRules,
                organizationSettings,
                slots,
                provider,
                analytics,
            } = setup();
            organizationRules.get.mockResolvedValue({
                source: scenario.source,
            });
            if (scenario.state !== 'missing') {
                slots.getSecrets.mockResolvedValue({ slot, secrets });
                slots.getSlot.mockResolvedValue(slot);
            }
            if (scenario.state === 'unreadable') {
                slots.getSecrets.mockRejectedValue(
                    new Error('cannot decrypt saved-key'),
                );
                provider.probe.mockResolvedValue({
                    ok: false,
                    checkedAt: new Date(),
                    observed: {},
                    transient: false,
                    reason: AiSessionFailureReason.NOT_AGENT_SESSION,
                    message: 'inactive',
                });
            }
            if (scenario.state === 'missing') {
                provider.missingPrerequisite.mockResolvedValue(
                    AiAccessRefusalReason.NEEDS_SIGN_IN,
                );
                provider.mint.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.NEEDS_SIGN_IN,
                    ),
                );
            }
            const request = { ...args, ...scenario };
            const execution = service.resolvePlan(request);
            if (scenario.reason) {
                await expect(execution).rejects.toMatchObject({
                    refusal: { reason: scenario.reason },
                });
            } else {
                await expect(execution).resolves.toMatchObject({
                    identity: scenario.identity,
                    audit: {
                        actorKind: scenario.isServiceAccount
                            ? 'service_account'
                            : 'person',
                    },
                });
            }
            const slotRefusal =
                scenario.reason ===
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING ||
                scenario.reason ===
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID;
            expect(analytics.track).toHaveBeenCalledTimes(
                scenario.reason ? 1 : 0,
            );
            if (slotRefusal)
                expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                    event: 'query.refused',
                    ...(scenario.actor === 'person'
                        ? { userId: 'user' }
                        : { anonymousId: LightdashAnalytics.anonymousId }),
                    properties: {
                        actor: {
                            surface: 'in_app_agent',
                            clientId: 'lightdash-chat',
                        },
                        organizationId: 'org',
                        projectId: 'project',
                        userId: scenario.actor === 'person' ? 'user' : null,
                        warehouseConnectionId: null,
                        surface: QuerySurface.APP,
                        warehouseType: scenario.connection.type,
                        reason: scenario.reason,
                    },
                });
            expect(organizationRules.get).toHaveBeenCalledWith(
                'org',
                scenario.connection.type,
                scenario.isServiceAccount ? 'service_account' : 'person',
            );
            expect(organizationSettings.get).not.toHaveBeenCalled();
            analytics.track.mockClear();
            if (scenario.reason)
                await expect(
                    service.resolvePlan({
                        ...request,
                        evaluation: { kind: 'diagnostic' },
                    }),
                ).rejects.toMatchObject({
                    refusal: { reason: scenario.reason },
                });
            else
                await service.resolvePlan({
                    ...request,
                    evaluation: { kind: 'diagnostic' },
                });
            expect(analytics.track).not.toHaveBeenCalled();
            expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
                /saved-key|agent@example.com|keyfileContents|SELECT/,
            );
        },
    );

    test.each(resolutionCases)(
        'metadata access $actor $connection.type $source state=$state',
        async (scenario) => {
            const { service, organizationRules, slots, analytics, provider } =
                setup();
            organizationRules.get.mockResolvedValue({
                source: scenario.source,
            });
            slots.getSlot.mockResolvedValue(
                scenario.state === 'missing' ? null : slot,
            );
            slots.getSecrets.mockRejectedValue(new Error('must not decrypt'));
            if (scenario.state === 'missing')
                provider.missingPrerequisite.mockResolvedValue(
                    AiAccessRefusalReason.NEEDS_SIGN_IN,
                );
            const access = await service.getAiAccessForUser({
                ...args,
                ...scenario,
            });
            const expectedReason =
                scenario.reason ===
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID ||
                scenario.reason === AiAccessRefusalReason.PRINCIPAL_FAILED
                    ? null
                    : scenario.reason;
            expect(access.source).toBe(scenario.source);
            expect(access.refusal?.reason ?? null).toBe(expectedReason);
            if (!expectedReason)
                expect(access.identity).toBe(scenario.identity);
            expect(slots.getSecrets).not.toHaveBeenCalled();
            expect(provider.mint).not.toHaveBeenCalled();
            expect(provider.probe).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
        },
    );

    test('overlays only slot authentication on the current connection', async () => {
        const { service, organizationRules, slots } = setup();
        organizationRules.get.mockResolvedValue({
            source: 'ai_service_account',
        });
        slots.getSecrets.mockResolvedValue({ slot, secrets });
        const resolved = await service.resolvePlan({
            ...args,
            connection: bigquery,
            warehouseConnectionUuid: 'extra',
        });
        expect(slots.getSecrets).toHaveBeenCalledExactlyOnceWith(
            'project',
            'extra',
            true,
        );
        expect(resolved).toMatchObject({
            identity: 'ai_service_account',
            identityUuid: slot.identityUuid,
            credentialUuid: slot.uuid,
            credentials: {
                ...bigquery,
                ...secrets,
                requireUserCredentials: false,
                allowUserCredentials: false,
            },
            audit: {
                actorKind: 'person',
                personUuid: 'user',
                userUuid: 'user',
            },
        });
        expect(resolved).toMatchObject({
            assurances: [
                { kind: 'agent_marker' },
                { kind: 'result_cache_off' },
            ],
        });
    });

    test.each(['marked_person', 'agent_sign_in'] as const)(
        'connect prompt reads the person Snowflake rule: %s',
        async (source) => {
            const {
                service,
                organizationRules,
                organizationSettings,
                provider,
            } = setup();
            organizationRules.get.mockResolvedValue({ source });
            provider.missingPrerequisite.mockResolvedValue(
                AiAccessRefusalReason.SIGN_IN_EXPIRED,
            );
            expect(
                await service.getAgentConnectPrompt({
                    ...sessionUser,
                    organizationUuid: 'org',
                    userUuid: 'user',
                    ability: viewer.user.ability,
                }),
            ).toEqual(
                source === 'agent_sign_in'
                    ? {
                          required: true,
                          reason: 'sign_in_expired',
                          projectUuid: 'project',
                      }
                    : { required: false },
            );
            expect(organizationRules.get).toHaveBeenCalledExactlyOnceWith(
                'org',
                WarehouseTypes.SNOWFLAKE,
                'person',
            );
            expect(organizationSettings.get).not.toHaveBeenCalled();
        },
    );

    test.each(
        [QuerySurface.APP, QuerySurface.MCP].flatMap((surface) =>
            [
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
            ].map((reason) => ({ surface, reason })),
        ),
    )(
        'slot refusal $reason on $surface has one event and admin URLs',
        async ({ reason, surface }) => {
            const { service, organizationRules, slots, analytics } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'ai_service_account',
            });
            if (reason === AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID)
                slots.getSecrets.mockRejectedValue(new Error('saved-key'));
            await expect(
                service.resolvePlan({
                    ...args,
                    connection: bigquery,
                    evaluation: { kind: 'query', surface },
                }),
            ).rejects.toMatchObject({
                refusal: {
                    reason,
                    action: 'ask_admin',
                    settingsUrl: '/generalSettings/agentIdentity',
                    connectUrl: null,
                },
            });
            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                event: 'query.refused',
                userId: 'user',
                properties: {
                    organizationId: 'org',
                    projectId: 'project',
                    userId: 'user',
                    warehouseConnectionId: null,
                    surface,
                    actor:
                        surface === QuerySurface.MCP
                            ? { surface: 'mcp', clientId: null }
                            : {
                                  surface: 'in_app_agent',
                                  clientId: 'lightdash-chat',
                              },
                    warehouseType: WarehouseTypes.BIGQUERY,
                    reason,
                },
            });
            expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(
                /saved-key|agent@example.com|keyfileContents|SELECT/,
            );
        },
    );

    test.each([false, true])(
        'checks slot generation after replacement, composed=%s',
        async (composed) => {
            const {
                service,
                organizationRules,
                slots,
                projects,
                historyModel,
                analytics,
            } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'ai_service_account',
            });
            slots.getSecrets.mockResolvedValue({ slot, secrets });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                bigquery,
            );
            const history = {
                queryUuid: 'query',
                status: QueryHistoryStatus.READY,
                requestParameters: {
                    aiSignInCredentialUuid: slot.identityUuid,
                },
            } as QueryHistory;
            if (composed) {
                historyModel.getDuckdbExecution.mockImplementation(
                    async (uuid) =>
                        uuid === 'query'
                            ? { references: { source: 'source' } }
                            : null,
                );
                historyModel.get.mockResolvedValue({
                    ...history,
                    queryUuid: 'source',
                });
            }
            await expect(
                service.assertCanReadResults(account, 'project', history),
            ).resolves.toMatchObject({
                identity: 'ai_service_account',
                identityUuid: slot.identityUuid,
            });
            slots.getSecrets.mockResolvedValue({
                slot: { ...slot, identityUuid: 'replacement-generation' },
                secrets,
            });
            await expect(
                service.assertCanReadResults(account, 'project', history),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                },
            });
            expect(analytics.track).not.toHaveBeenCalled();
            slots.getSecrets.mockRejectedValue(new Error('cannot decrypt'));
            await expect(
                service.assertCanReadResults(account, 'project', history),
            ).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
                },
            });
            expect(analytics.track).not.toHaveBeenCalled();
        },
    );
});

describe('slot result composition and identity validation', () => {
    test('refuses a composition of valid but different slot generations', async () => {
        const {
            service,
            organizationRules,
            slots,
            projects,
            connections,
            historyModel,
            analytics,
        } = setup();
        organizationRules.get.mockResolvedValue({
            source: 'ai_service_account',
        });
        projects.getWarehouseCredentialsForBinding.mockResolvedValue(bigquery);
        connections.getCredentials.mockResolvedValue(bigquery);
        slots.getSecrets
            .mockResolvedValueOnce({ slot, secrets })
            .mockResolvedValueOnce({
                slot: { ...slot, identityUuid: 'other-generation' },
                secrets,
            });
        historyModel.getDuckdbExecution.mockImplementation(async (uuid) =>
            uuid === 'composed' ? { references: { source: 'source' } } : null,
        );
        historyModel.get.mockResolvedValue({
            queryUuid: 'source',
            status: QueryHistoryStatus.READY,
            warehouseConnectionUuid: 'extra',
            requestParameters: { aiSignInCredentialUuid: 'other-generation' },
        });
        await expect(
            service.assertCanReadResults(account, 'project', {
                queryUuid: 'composed',
                status: QueryHistoryStatus.READY,
                requestParameters: {
                    aiSignInCredentialUuid: slot.identityUuid,
                },
            } as QueryHistory),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            },
        });
        expect(analytics.track).not.toHaveBeenCalled();
    });

    test.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.SIGN_IN_EXPIRED,
    ])('refuses an unavailable agent sign-in: %s', async (reason) => {
        const { service, provider, analytics } = setup();
        provider.missingPrerequisite.mockResolvedValue(reason);
        provider.mint.mockRejectedValue(new AiAccessRefusedError(reason));
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).rejects.toMatchObject({ refusal: { reason } });
        expect(
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            }),
        ).toMatchObject({
            requirementSource: 'organization',
            source: 'agent_sign_in',
            refusal: { reason },
        });
        expect(
            analytics.track.mock.calls.filter(
                ([event]) => event.event === 'query.refused',
            ),
        ).toHaveLength(1);
    });

    test('reports invalid metadata without decrypting or emitting execution analytics', async () => {
        const { service, organizationRules, slots, analytics } = setup();
        organizationRules.get.mockResolvedValue({
            source: 'ai_service_account',
        });
        slots.getSlot.mockResolvedValue({ ...slot, method: 'oauth_m2m' });
        expect(
            await service.getAiAccessForUser({ ...args, connection: bigquery }),
        ).toMatchObject({
            identity: 'ai_service_account',
            source: 'ai_service_account',
            principalKind: 'service_account',
            refusal: {
                reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
            },
        });
        expect(slots.getSecrets).not.toHaveBeenCalled();
        expect(analytics.track).not.toHaveBeenCalled();
    });
});

describe('bounded stored result lineage', () => {
    const buildGraph = (edges: Record<string, string[]>) => {
        const built = setup();
        const rows = Object.fromEntries(
            Object.keys(edges).map((queryUuid) => [
                queryUuid,
                {
                    queryUuid,
                    organizationUuid: 'org',
                    context: QueryExecutionContext.COMPOSE_SQL_RUNNER,
                    status: QueryHistoryStatus.READY,
                    requestParameters: {},
                } as QueryHistory,
            ]),
        );
        const execution = (uuid: string) => ({
            references: Object.fromEntries(
                edges[uuid].map((source, i) => [`source_${i}`, source]),
            ),
        });
        built.historyModel.get.mockImplementation(
            async (uuid: string) => rows[uuid],
        );
        built.historyModel.getDuckdbExecution.mockImplementation(
            async (uuid: string) => execution(uuid),
        );
        const batch = vi.fn(async (uuids: string[]) =>
            uuids.map((uuid) => ({
                queryHistory: rows[uuid],
                execution: execution(uuid),
            })),
        );
        Object.assign(built.historyModel, {
            getManyWithDuckdbExecutions: batch,
        });
        return { ...built, rows, batch };
    };

    test.each(
        [
            {
                surface: QuerySurface.MCP,
                actor: {
                    surface: AgentActorSurface.MCP,
                    clientId: 'oauth-client',
                },
            },
            {
                surface: QuerySurface.API,
                actor: {
                    surface: AgentActorSurface.AI_SUMMARY,
                    clientId: 'lightdash-ai-summary',
                },
            },
            {
                surface: QuerySurface.APP,
                actor: {
                    surface: AgentActorSurface.IN_APP_AGENT,
                    clientId: 'lightdash-chat',
                },
            },
        ].flatMap((scenario) =>
            ['sign_in', 'stale_root', 'stale_source'].map((refusalPath) => ({
                ...scenario,
                refusalPath,
            })),
        ),
    )(
        'attributes $refusalPath compose refusals to the current $actor.surface actor',
        async ({ surface, actor, refusalPath }) => {
            const {
                service,
                rows,
                provider,
                projects,
                analytics,
                flags,
                connections,
            } = buildGraph({ root: ['source'], source: [] });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                snowflake,
            );
            if (refusalPath === 'sign_in') {
                provider.mint.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.NEEDS_SIGN_IN,
                    ),
                );
            } else if (refusalPath === 'stale_source') {
                rows.root.warehouseConnectionUuid = 'root-connection';
                connections.getCredentials.mockResolvedValue(connection);
                rows.source.requestParameters = {
                    sql: 'SELECT 1',
                    aiSignInCredentialUuid: 'agent-credential',
                };
            }
            rows.source.agentIdentity = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: 'source-user' },
                surface: AgentActorSurface.IN_APP_AGENT,
                clientId: 'lightdash-chat',
            });
            const submittingAccount = {
                ...account,
                authentication: {
                    type: 'oauth' as const,
                    clientId: 'oauth-client',
                    source: 'test-token',
                    token: 'test-token',
                    scopes: [],
                },
            };
            const submit = () =>
                service.assertCanReadResultsForQueries(
                    submittingAccount,
                    'project',
                    [{ queryHistory: rows.root, agentProducedOnly: false }],
                    { kind: 'query', surface },
                    undefined,
                    QueryExecutionContext.AI,
                );
            const result =
                actor.surface === AgentActorSurface.AI_SUMMARY
                    ? agentExecutionContext.run(actor, submit)
                    : submit();
            await expect(result).rejects.toMatchObject({
                refusal: {
                    reason:
                        refusalPath === 'sign_in'
                            ? AiAccessRefusalReason.NEEDS_SIGN_IN
                            : AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                },
            });
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'query.refused',
                    properties: expect.objectContaining({ actor }),
                }),
            );
            expect(
                (flags.get.mock.calls as unknown[][]).filter(
                    (call) =>
                        (call[0] as { featureFlagId?: string } | undefined)
                            ?.featureFlagId === FeatureFlags.AgentIdentity,
                ),
            ).toHaveLength(1);
        },
    );

    test('keeps each source identity separate on a mixed-actor compose and stored read', async () => {
        const { service, rows, batch } = buildGraph({
            root: ['chat', 'mcp'],
            chat: [],
            mcp: [],
        });
        const info = vi
            .spyOn(service['logger'], 'info')
            .mockImplementation(() => service['logger']);
        rows.chat.agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'chat-user' },
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: 'lightdash-chat',
        });
        rows.mcp.agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'service_account', uuid: 'service-account' },
            surface: AgentActorSurface.MCP,
            clientId: null,
        });
        rows.root.agentIdentity = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'composer-user' },
            surface: AgentActorSurface.SLACK_AGENT,
            clientId: 'A123',
        });
        const plans = await service.assertCanReadResultsForQueries(
            account,
            'project',
            [{ queryHistory: rows.root, agentProducedOnly: false }],
        );
        expect(plans.get('root')?.agentIdentity).toEqual(
            rows.root.agentIdentity,
        );
        expect(plans.get('root')?.sourceIdentities).toEqual([
            { queryUuid: 'chat', agentIdentity: rows.chat.agentIdentity },
            { queryUuid: 'mcp', agentIdentity: rows.mcp.agentIdentity },
        ]);
        expect(plans.get('chat')?.agentIdentity).toEqual(
            rows.chat.agentIdentity,
        );
        expect(plans.get('mcp')?.agentIdentity).toEqual(rows.mcp.agentIdentity);
        expect(info).toHaveBeenCalledWith(
            'Agent result lineage',
            expect.objectContaining({
                queryUuid: 'root',
                agentIdentity: rows.root.agentIdentity,
                sourceIdentities: [
                    {
                        queryUuid: 'chat',
                        agentIdentity: rows.chat.agentIdentity,
                    },
                    { queryUuid: 'mcp', agentIdentity: rows.mcp.agentIdentity },
                ],
            }),
        );
        info.mockRestore();
        expect(batch).toHaveBeenCalledOnce();
        expect(
            (
                await service.assertCanReadResults(account, 'project', {
                    ...rows.mcp,
                    duckdbExecutionReferences: {},
                })
            )?.agentIdentity,
        ).toEqual(rows.mcp.agentIdentity);
    });

    test('flag off performs zero lineage reads for a compose with references', async () => {
        const { service, flags, historyModel, rows, batch } = buildGraph({
            root: ['source'],
            source: [],
        });
        flags.get.mockResolvedValue({ enabled: false });
        rows.root.requestParameters = {
            sql: 'SELECT * FROM source',
            references: { source: 'source' },
        };
        await expect(
            service.assertCanReadResults(account, 'project', rows.root),
        ).resolves.toBeNull();
        expect(historyModel.get).not.toHaveBeenCalled();
        expect(historyModel.getDuckdbExecution).not.toHaveBeenCalled();
        expect(batch).not.toHaveBeenCalled();
        expect(flags.get).toHaveBeenCalledOnce();
    });

    test.each([1, 2])(
        'a 20-node DAG reads lineage once and resolves plans once per connection (%s connections)',
        async (connectionCount) => {
            const edges = Object.fromEntries(
                Array.from({ length: 20 }, (_, i) => [
                    String(i),
                    [i - 1, i - 2].filter((n) => n >= 0).map(String),
                ]),
            );
            const {
                service,
                flags,
                historyModel,
                rows,
                batch,
                organizationRules,
                slots,
                projects,
                connections,
            } = buildGraph(edges);
            organizationRules.get.mockResolvedValue({
                source: 'ai_service_account',
            });
            slots.getSecrets.mockResolvedValue({ slot, secrets });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                bigquery,
            );
            connections.getCredentials.mockResolvedValue(bigquery);
            const defaultConnectionReads = vi.spyOn(
                projects,
                'getWarehouseCredentialsForBinding',
            );
            const additionalConnectionReads = vi.spyOn(
                connections,
                'getCredentials',
            );
            const secretReads = vi.spyOn(slots, 'getSecrets');
            for (const row of Object.values(rows)) {
                row.warehouseConnectionUuid =
                    connectionCount === 2 && Number(row.queryUuid) % 2 === 1
                        ? 'additional-connection'
                        : null;
                row.context = QueryExecutionContext.AI;
                row.requestParameters = {
                    ...row.requestParameters,
                    aiSignInCredentialUuid: slot.identityUuid,
                };
            }
            await service.assertCanReadResults(account, 'project', rows['19']);
            const rowReads = [
                ...historyModel.get.mock.calls.map(([uuid]) => uuid),
                ...batch.mock.calls.flatMap(([uuids]) => uuids),
            ];
            const specReads = [
                ...historyModel.getDuckdbExecution.mock.calls.map(
                    ([uuid]) => uuid,
                ),
                ...batch.mock.calls.flatMap(([uuids]) => uuids),
            ];
            for (let i = 0; i < 19; i += 1) {
                expect(
                    rowReads.filter((uuid) => uuid === String(i)),
                ).toHaveLength(1);
            }
            for (let i = 0; i < 20; i += 1) {
                expect(
                    specReads.filter((uuid) => uuid === String(i)),
                ).toHaveLength(1);
            }
            expect(flags.get).toHaveBeenCalledOnce();
            expect(defaultConnectionReads).toHaveBeenCalledOnce();
            expect(additionalConnectionReads).toHaveBeenCalledTimes(
                connectionCount - 1,
            );
            expect(secretReads).toHaveBeenCalledTimes(connectionCount);
            expect(secretReads).toHaveBeenCalledWith('project', null, true);
            if (connectionCount === 2) {
                expect(secretReads).toHaveBeenCalledWith(
                    'project',
                    'additional-connection',
                    true,
                );
            }
        },
    );

    test.each(['nodes', 'depth'] as const)(
        'refuses lineage beyond the %s cap with a typed refusal',
        async (cap) => {
            const edges =
                cap === 'nodes'
                    ? {
                          root: Array.from({ length: 500 }, (_, i) =>
                              String(i),
                          ),
                          ...Object.fromEntries(
                              Array.from({ length: 500 }, (_, i) => [
                                  String(i),
                                  [],
                              ]),
                          ),
                      }
                    : {
                          root: ['0'],
                          ...Object.fromEntries(
                              Array.from({ length: 51 }, (_, i) => [
                                  String(i),
                                  i === 50 ? [] : [String(i + 1)],
                              ]),
                          ),
                      };
            const { service, historyModel, rows, batch } = buildGraph(edges);
            const read = service.assertCanReadResults(
                account,
                'project',
                rows.root,
            );
            await expect(read).rejects.toBeInstanceOf(AiAccessRefusedError);
            await expect(read).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                },
            });
            const rowReads =
                historyModel.get.mock.calls.length +
                batch.mock.calls.reduce(
                    (count, [uuids]) => count + uuids.length,
                    0,
                );
            expect(rowReads).toBe(cap === 'nodes' ? 0 : 50);
        },
    );

    test.each(['nodes', 'depth'] as const)(
        'allows lineage at the %s cap',
        async (cap) => {
            const edges =
                cap === 'nodes'
                    ? {
                          root: Array.from({ length: 499 }, (_, i) =>
                              String(i),
                          ),
                          ...Object.fromEntries(
                              Array.from({ length: 499 }, (_, i) => [
                                  String(i),
                                  [],
                              ]),
                          ),
                      }
                    : {
                          root: ['0'],
                          ...Object.fromEntries(
                              Array.from({ length: 50 }, (_, i) => [
                                  String(i),
                                  i === 49 ? [] : [String(i + 1)],
                              ]),
                          ),
                      };
            const { service, rows } = buildGraph(edges);
            await expect(
                service.assertCanReadResults(account, 'project', rows.root),
            ).resolves.toMatchObject({ identity: 'marked_person' });
        },
    );

    test('refuses a path beyond the depth cap even when every ancestor has a shortcut from the root', async () => {
        const edges = {
            root: Array.from({ length: 51 }, (_, i) => String(i)),
            ...Object.fromEntries(
                Array.from({ length: 51 }, (_, i) => [
                    String(i),
                    i === 50 ? [] : [String(i + 1)],
                ]),
            ),
        };
        const { service, rows } = buildGraph(edges);
        await expect(
            service.assertCanReadResults(account, 'project', rows.root),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
    });

    test('refuses a cycle through a shared ancestor', async () => {
        const { service, rows } = buildGraph({
            root: ['left', 'right'],
            left: ['shared'],
            right: ['shared'],
            shared: ['right'],
        });
        await expect(
            service.assertCanReadResults(account, 'project', rows.root),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            },
        });
    });
});

describe('current identity transitions', () => {
    const bqArgs = { ...args, connection: bigquery };
    const readyResult = {
        queryUuid: 'query',
        status: QueryHistoryStatus.READY,
        context: QueryExecutionContext.AI,
        requestParameters: { aiSignInCredentialUuid: slot.identityUuid },
        duckdbExecutionReferences: null,
    } as QueryHistoryWithLineage;

    const serviceAccountFixture = () => {
        const fixture = setup();
        fixture.organizationRules.get.mockResolvedValue({
            source: 'ai_service_account',
        });
        fixture.slots.getSecrets.mockResolvedValue({ slot, secrets });
        fixture.projects.getWarehouseCredentialsForBinding.mockResolvedValue(
            bigquery,
        );
        return fixture;
    };

    test('the next resolution reads a replacement and refuses the old results', async () => {
        const { service, slots, organizationRules } = serviceAccountFixture();
        expect(
            getAiExecutionCredentialUuid(await service.resolvePlan(bqArgs)),
        ).toBe(slot.identityUuid);
        await service.assertCanReadResults(account, 'project', readyResult);
        slots.getSecrets.mockResolvedValue({
            slot: { ...slot, identityUuid: 'new-generation' },
            secrets,
        });
        expect(
            getAiExecutionCredentialUuid(await service.resolvePlan(bqArgs)),
        ).toBe('new-generation');
        await expect(
            service.assertCanReadResults(account, 'project', readyResult),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
            },
        });
        expect(slots.getSecrets).toHaveBeenCalledTimes(4);
        expect(organizationRules.get).toHaveBeenCalledTimes(4);
    });

    test('the next resolution and old result read both reject a removed service account', async () => {
        const { service, slots } = serviceAccountFixture();
        await service.resolvePlan(bqArgs);
        slots.getSecrets.mockResolvedValue(null);
        await expect(service.resolvePlan(bqArgs)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
            },
        });
        await expect(
            service.assertCanReadResults(account, 'project', readyResult),
        ).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
            },
        });
    });

    test.each([false, true])(
        'flag off performs no identity reads with result identity check=%s',
        async (enabled) => {
            const {
                service,
                flags,
                organizationRules,
                organizationSettings,
                slots,
                credentials,
                provider,
                projects,
                historyModel,
            } = setup(enabled);
            flags.get.mockResolvedValue({ enabled: false });
            await expect(service.resolvePlan(bqArgs)).resolves.toBeNull();
            await expect(
                service.assertCanReadResults(account, 'project', readyResult),
            ).resolves.toBeNull();
            expect(organizationRules.get).not.toHaveBeenCalled();
            expect(organizationSettings.get).not.toHaveBeenCalled();
            expect(historyModel.getDuckdbExecution).not.toHaveBeenCalled();
            expect(slots.getSecrets).not.toHaveBeenCalled();
            expect(slots.getSlot).not.toHaveBeenCalled();
            expect(
                credentials.findAiCredentialWithSecrets,
            ).not.toHaveBeenCalled();
            expect(provider.mint).not.toHaveBeenCalled();
            expect(
                projects.getWarehouseCredentialsForBinding,
            ).not.toHaveBeenCalled();
        },
    );
});

describe('retained results after identity rule changes', () => {
    test.each(
        [bigquery, snowflake].flatMap((selectedConnection) =>
            [false, true].flatMap((enabled) =>
                [false, true].map((composed) => ({
                    selectedConnection,
                    enabled,
                    composed,
                })),
            ),
        ),
    )(
        'checks $selectedConnection.type results after switching to marked person, enabled=$enabled composed=$composed',
        async ({ selectedConnection, enabled, composed }) => {
            const {
                service,
                organizationRules,
                slots,
                projects,
                historyModel,
            } = setup(enabled);
            organizationRules.get.mockResolvedValue({
                source:
                    selectedConnection.type === WarehouseTypes.BIGQUERY
                        ? 'ai_service_account'
                        : 'agent_sign_in',
            });
            slots.getSecrets.mockResolvedValue({ slot, secrets });
            projects.getWarehouseCredentialsForBinding.mockResolvedValue(
                selectedConnection,
            );
            const plan = await service.resolvePlan({
                ...args,
                connection: selectedConnection,
            });
            const source = {
                queryUuid: 'source',
                status: QueryHistoryStatus.READY,
                context: QueryExecutionContext.AI,
                requestParameters: {
                    aiSignInCredentialUuid: getAiExecutionCredentialUuid(plan),
                },
                duckdbExecutionReferences: null,
            } as QueryHistoryWithLineage;
            await service.assertCanReadResults(account, 'project', source);
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
            });
            await expect(
                service.resolvePlan({
                    ...args,
                    connection: selectedConnection,
                }),
            ).resolves.toMatchObject({ identity: 'marked_person' });
            historyModel.get.mockResolvedValue(source);
            const root = composed
                ? ({
                      ...source,
                      queryUuid: 'composed',
                      duckdbExecutionReferences: { source: source.queryUuid },
                      requestParameters: {
                          sql: 'SELECT * FROM source',
                          references: { source: source.queryUuid },
                      },
                  } as QueryHistory)
                : source;
            const read = service.assertCanReadResults(account, 'project', root);
            if (enabled) {
                await expect(read).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
                    },
                });
            } else {
                await expect(read).resolves.toMatchObject({
                    identity: 'marked_person',
                });
            }
        },
    );

    test.each([undefined, null])(
        'keeps person results readable with stored credential %s',
        async (credential) => {
            const { service, organizationRules } = setup();
            organizationRules.get.mockResolvedValue({
                source: 'marked_person',
            });
            await expect(
                service.assertCanReadResults(account, 'project', {
                    queryUuid: 'person-query',
                    status: QueryHistoryStatus.READY,
                    context: QueryExecutionContext.AI,
                    requestParameters: { aiSignInCredentialUuid: credential },
                } as QueryHistory),
            ).resolves.toMatchObject({ identity: 'marked_person' });
        },
    );
});

describe('silent refresh routing', () => {
    test.each([QuerySurface.MCP, QuerySurface.APP, QuerySurface.API])(
        'returns an administrator-directed OAuth refusal without reconnect or expiry events on %s',
        async (surface) => {
            const { service, registry, analytics } = setup();
            const model = {
                findAiCredentialWithSecrets: vi.fn(async () => ({
                    uuid: 'credential',
                    expiresAt: null,
                    credentials: {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'refresh-token',
                    },
                })),
                rotateRefreshToken: vi.fn(),
                deleteAiCredential: vi.fn(),
            };
            registry.mockReturnValue(
                new SnowflakeAiCredentialProvider({
                    lightdashConfig: {
                        ...lightdashConfigMock,
                        auth: {
                            ...lightdashConfigMock.auth,
                            snowflakeAi: {
                                ...lightdashConfigMock.auth.snowflakeAi,
                                clientId: 'client',
                                clientSecret: 'secret',
                                authorizationEndpoint:
                                    'https://warehouse.example/authorize',
                                tokenEndpoint:
                                    'https://warehouse.example/token',
                                account: 'test-account',
                            },
                        },
                    },
                    userWarehouseCredentialsModel:
                        model as unknown as UserWarehouseCredentialsModel,
                }),
            );
            const exchange = vi
                .spyOn(refresh, 'requestNewAccessToken')
                .mockImplementation((_strategy, _token, callback) =>
                    callback(
                        { statusCode: 400, data: '{"error":"invalid_client"}' },
                        '',
                        '',
                        {},
                    ),
                );
            try {
                await expect(
                    service.resolvePlan({
                        ...args,
                        connection: snowflake,
                        evaluation: { kind: 'query', surface },
                    }),
                ).rejects.toMatchObject({
                    refusal: {
                        reason: AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                        action: null,
                        connectUrl: null,
                        message:
                            'The warehouse OAuth client was rejected. Ask an administrator to check the agent sign-in settings.',
                    },
                });
                expect(
                    analytics.track.mock.calls.map(([event]) => event.event),
                ).toEqual(['query.refused']);
                expect(model.rotateRefreshToken).not.toHaveBeenCalled();
                expect(model.deleteAiCredential).not.toHaveBeenCalled();
            } finally {
                exchange.mockRestore();
            }
        },
    );
    test('preserves a retryable error without refusal analytics or URLs', async () => {
        const { service, provider, analytics } = setup();
        const error = new UnexpectedServerError('Try again in a moment.', {
            code: 'warehouse_oauth_refresh_failed',
            retryable: true,
        });
        provider.mint.mockRejectedValue(error);
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).rejects.toBe(error);
        expect(analytics.track).not.toHaveBeenCalled();
    });
    test('does not read the kill switch or credentials with agent identity off', async () => {
        const { service, flags, credentials, organizationRules, provider } =
            setup();
        flags.get.mockResolvedValue({ enabled: false });
        await expect(
            service.resolvePlan({ ...args, connection: snowflake }),
        ).resolves.toBeNull();
        expect(flags.get).toHaveBeenCalledExactlyOnceWith({
            user: { userUuid: 'user', organizationUuid: 'org' },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        expect(credentials.findAiCredentialWithSecrets).not.toHaveBeenCalled();
        expect(organizationRules.get).not.toHaveBeenCalled();
        expect(provider.mint).not.toHaveBeenCalled();
    });
    test.each([true, false])(
        'passes resolved silent refresh %s to mint and status',
        async (enabled) => {
            const { service, flags, provider } = setup();
            flags.get
                .mockResolvedValueOnce({ enabled: true })
                .mockResolvedValueOnce({ enabled });
            await service.resolvePlan({ ...args, connection: snowflake });
            expect(flags.get).toHaveBeenLastCalledWith({
                user: { userUuid: 'user', organizationUuid: 'org' },
                featureFlagId: FeatureFlags.AgentIdentitySilentRefresh,
            });
            expect(provider.mint).toHaveBeenCalledWith(
                expect.objectContaining({ silentRefresh: enabled }),
            );
            flags.get
                .mockResolvedValueOnce({ enabled: true })
                .mockResolvedValueOnce({ enabled });
            await service.getAiAccessForUser({
                ...args,
                connection: snowflake,
            });
            expect(provider.missingPrerequisite).toHaveBeenCalledWith(
                expect.objectContaining({ silentRefresh: enabled }),
            );
        },
    );
});
