import { Ability } from '@casl/ability';
import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    buildAgentIdentityClaim,
    ForbiddenError,
    QueryExecutionContext,
    QueryHistoryStatus,
    WarehouseTypes,
    type AiAgent,
    type AiArtifact,
    type PossibleAbilities,
    type QueryHistory,
    type SessionUser,
    type SlackPrompt,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { fromApiKey, fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { AiAccessService } from '../../../services/AiAccessService/AiAccessService';
import { aiServiceAccountPlanMock } from '../../../services/AiAccessService/AiAccessService.mock';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { WarehouseClientFactory } from '../../../services/WarehouseClientFactory/WarehouseClientFactory';
import { getResultEntitlementFingerprint } from '../../../utils/queryResultProducer';
import { withWarehouseCredentialVersion } from '../../../utils/warehouseCredentialVersion';
import { type SlackArtifactRenderInput } from '../../database/entities/aiSlackArtifactDeliveries';
import { AiAgentService } from './AiAgentService';

const setup = () => {
    const ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const user: SessionUser = {
        ...defaultSessionUser,
        userUuid: 'user',
        organizationUuid: 'org',
        ability,
        abilityRules: ability.rules,
    };
    const project = { projectUuid: 'project', organizationUuid: 'org' };
    const controls = { userAttributes: {}, intrinsicUserAttributes: {} };
    const claim = buildAgentIdentityClaim({
        subject: { type: 'user', uuid: user.userUuid },
        surface: AgentActorSurface.SLACK_AGENT,
        clientId: 'installed-app',
        agentUuid: 'agent',
    });
    const credentials = withWarehouseCredentialVersion(
        {
            type: WarehouseTypes.POSTGRES,
            host: 'dummy',
            port: 5432,
            user: 'person',
            password: 'dummy',
            schema: 'public',
            dbname: 'dummy',
        },
        'shared-generation',
    );
    const plan = {
        ...aiServiceAccountPlanMock,
        audit: {
            ...aiServiceAccountPlanMock.audit,
            personUuid: user.userUuid,
            userUuid: user.userUuid,
        },
    };
    const producer = WarehouseClientFactory.getResultProducer(
        {
            warehouseCredentials: plan.credentials,
            aiPlan: plan,
            warehouseConnectionUuid: null,
        },
        user.userUuid,
        claim,
        getResultEntitlementFingerprint(controls),
        'session',
    );
    const history = {
        queryUuid: 'execution',
        projectUuid: 'project',
        organizationUuid: 'org',
        context: QueryExecutionContext.AI,
        status: QueryHistoryStatus.READY,
        createdByUserUuid: user.userUuid,
        createdByAccount: null,
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        requestParameters: {
            sql: 'select 1',
            resultProducer: producer,
            aiSignInCredentialUuid: plan.identityUuid,
        },
        agentIdentity: claim,
        resultsFileName: 'original.jsonl',
        totalRowCount: 2,
        resultsExpiresAt: new Date(Date.now() + 60_000),
        fields: {},
        columns: [],
        usedParameters: {},
        defaultPageSize: 1,
    } as unknown as QueryHistory;
    const flags = { enabled: true };
    const projectModel = {
        getSummary: vi.fn(async () => project),
        getWarehouseCredentialsForBinding: vi.fn(async () => credentials),
    };
    const queryHistoryModel = {
        get: vi.fn(async () => history),
        getDuckdbExecution: vi.fn(async () => null),
        recordResultArtifact: vi.fn(
            async (
                _queryUuid: string,
                _projectUuid: string,
                _accountId: string,
                binding: NonNullable<
                    QueryHistory['requestParameters']['resultArtifact']
                >,
            ) => {
                history.requestParameters.resultArtifact = binding;
            },
        ),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn(async () => user),
    };
    const factory = {
        resolveWarehouseCredentials: vi.fn(async () => ({
            warehouseCredentials: credentials,
            aiPlan: null,
            warehouseConnectionUuid: null,
        })),
    };
    const config = {
        ...lightdashConfigMock,
        ai: {
            ...lightdashConfigMock.ai,
            agentResultIdentityCheckEnabled: true,
        },
    };
    const access = new AiAccessService({
        lightdashConfig: config,
        featureFlagModel: { get: async () => flags },
        projectModel,
        queryHistoryModel,
        getWarehouseClientFactory: () => factory,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const resolvePlan = vi
        .spyOn(
            access as unknown as {
                resolveEnabledPlan: AiAccessService['resolveEnabledPlan'];
            },
            'resolveEnabledPlan',
        )
        .mockResolvedValue(plan);
    const getDownloadStream = vi.fn(async () => Readable.from(['{}\n{}\n']));
    const asyncService: AsyncQueryService = Object.assign(
        Object.create(AsyncQueryService.prototype),
        {
            lightdashConfig: config,
            logger: Logger,
            projectModel,
            queryHistoryModel,
            userModel,
            warehouseClientFactory: factory,
            aiAccessService: access,
            resultsStorageClient: { isEnabled: true, getDownloadStream },
            analytics: { trackAccount: vi.fn() },
            getUserAttributes: vi.fn(async () => controls),
            assertAnalyticsProjectAccess: vi.fn(),
        },
    );
    const input: SlackArtifactRenderInput = {
        queryUuid: 'execution',
        artifactUuid: 'artifact',
        versionUuid: 'version',
        rowLimit: 2,
        queryTool: { queryConfig: { exploreName: 'orders' } },
    } as SlackArtifactRenderInput;
    const artifact = {
        artifactUuid: input.artifactUuid,
        versionUuid: input.versionUuid,
        promptUuid: 'prompt',
        threadUuid: 'thread',
        chartConfig: { source: 'customChartType' },
    } as AiArtifact;
    const prompt = {
        promptUuid: 'prompt',
        agentUuid: 'agent',
        projectUuid: 'project',
        organizationUuid: 'org',
        threadUuid: 'thread',
        createdByUserUuid: user.userUuid,
        response: 'Answer',
        errorMessage: null,
        slackChannelId: 'channel',
        slackUserId: 'slack-user',
    } as SlackPrompt;
    const thread = { user: { uuid: user.userUuid } };
    const agent = {
        uuid: 'agent',
        projectUuid: 'project',
        organizationUuid: 'org',
        enableDataAccess: true,
        tags: [],
    } as unknown as AiAgent;
    const delivery = {
        finished_at: null as Date | null,
        render_inputs: { version: input },
    };
    const service = new AiAgentService({
        lightdashConfig: config,
        featureFlagService: { get: async () => flags },
        aiAgentModel: {
            getAgent: vi.fn(async () => agent),
            getArtifact: vi.fn(async () => artifact),
            findThread: vi.fn(async () => ({
                organizationUuid: 'org',
                projectUuid: 'project',
                agentUuid: 'agent',
            })),
            getThread: vi.fn(async () => thread),
            slackArtifactDeliveries: { get: vi.fn(async () => delivery) },
            findSlackPrompt: vi.fn(async () => prompt),
            findWebAppPrompt: vi.fn(async () => ({ ...prompt })),
            hasAiPromptInterrupt: vi.fn(async () => false),
        },
        slackAuthenticationModel: {
            getInstallationFromOrganizationUuid: vi.fn(async () => ({
                aiAgentsEnabled: true,
                aiLinksOnly: false,
            })),
            getRawInstallationFromOrganizationUuid: vi.fn(async () => ({
                appId: 'installed-app',
                bot: { userId: 'bot' },
            })),
        },
        slackClient: { getWebClient: vi.fn(async () => ({})) },
        analytics: { track: vi.fn() },
        fileStorageClient: { isEnabled: () => true },
        userModel,
        asyncQueryService: asyncService,
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getAgent').mockImplementation(async () => agent);
    vi.spyOn(
        service as unknown as {
            getIsCopilotEnabled: AiAgentService['getIsCopilotEnabled'];
        },
        'getIsCopilotEnabled',
    ).mockResolvedValue(true);
    vi.spyOn(
        service as unknown as {
            getDecisionClient: AiAgentService['getDecisionClient'];
        },
        'getDecisionClient',
    ).mockResolvedValue({} as never);
    vi.spyOn(
        service as unknown as { getExplore: AiAgentService['getExplore'] },
        'getExplore',
    ).mockResolvedValue({} as never);
    const options = {
        projectUuid: 'project',
        agentUuid: 'agent',
        artifactUuid: 'artifact',
        versionUuid: 'version',
        queryUuid: 'execution',
        page: 1,
        pageSize: 1,
        cached: true,
    };
    return {
        service,
        asyncService,
        user,
        history,
        producer,
        claim,
        input,
        delivery,
        artifact,
        prompt,
        thread,
        flags,
        config,
        options,
        getDownloadStream,
        resolvePlan,
    };
};

afterEach(() => vi.restoreAllMocks());

describe('artifact result identity boundaries', () => {
    it('round 16 artifact readers retain the trusted PAT sign-in method', async () => {
        const { service, user, options, getDownloadStream } = setup();
        await expect(
            Reflect.apply(service.getArtifactQueryResults, service, [
                user,
                options,
                fromApiKey(user, 'test-pat'),
            ]),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });
    it('reads cached Slack metadata and every row page as the validated agent without an ambient scope', async () => {
        const {
            service,
            asyncService,
            user,
            options,
            getDownloadStream,
            resolvePlan,
        } = setup();
        expect(agentExecutionContext.getStore()).toBeUndefined();
        const viz = await service.getArtifactVizQuery(user, {
            ...options,
            cachedQueryUuid: options.queryUuid,
        });
        expect(viz.query.queryUuid).toBe('execution');
        expect(getDownloadStream).not.toHaveBeenCalled();
        const firstPage = await service.getArtifactQueryResults(user, options);
        const secondPage = await service.getArtifactQueryResults(user, {
            ...options,
            page: 2,
        });
        expect(firstPage).toMatchObject({
            status: QueryHistoryStatus.READY,
            queryUuid: 'execution',
            page: 1,
            rows: [{}],
        });
        expect(secondPage).toMatchObject({
            status: QueryHistoryStatus.READY,
            queryUuid: 'execution',
            page: 2,
            rows: [{}],
        });
        expect(getDownloadStream).toHaveBeenCalledTimes(2);
        expect(resolvePlan).toHaveBeenCalled();
        getDownloadStream.mockClear();
        await expect(
            asyncService.getAsyncQueryResults({
                account: fromSession(user),
                projectUuid: 'project',
                queryUuid: 'execution',
            }),
        ).rejects.toThrow(/Run the query again\.$/);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });

    it.each(['agent', 'surface', 'client', 'missing-producer'] as const)(
        'refuses a different %s before row storage',
        async (mismatch) => {
            const {
                service,
                user,
                options,
                producer,
                claim,
                history,
                getDownloadStream,
            } = setup();
            producer.agentIdentity = {
                ...claim,
                act: {
                    ...claim.act,
                    agent_uuid:
                        mismatch === 'agent'
                            ? 'another-agent'
                            : claim.act.agent_uuid,
                    surface:
                        mismatch === 'surface'
                            ? AgentActorSurface.IN_APP_AGENT
                            : claim.act.surface,
                    client_id:
                        mismatch === 'client'
                            ? 'another-app'
                            : claim.act.client_id,
                },
            };
            if (mismatch === 'missing-producer')
                history.requestParameters = { sql: 'select 1' };
            await expect(
                service.getArtifactVizQuery(user, {
                    ...options,
                    cachedQueryUuid: options.queryUuid,
                }),
            ).rejects.toThrow(/Run the query again\.$/);
            await expect(
                service.getArtifactQueryResults(user, options),
            ).rejects.toThrow(/Run the query again\.$/);
            expect(getDownloadStream).not.toHaveBeenCalled();
        },
    );

    it.each([
        'query',
        'artifact',
        'version',
        'creator',
        'agent',
        'thread',
        'project',
        'finished',
    ] as const)(
        'revalidates a changed delivery %s binding between row pages',
        async (binding) => {
            const {
                service,
                user,
                options,
                input,
                prompt,
                delivery,
                getDownloadStream,
            } = setup();
            await service.getArtifactQueryResults(user, options);
            getDownloadStream.mockClear();
            if (binding === 'query') input.queryUuid = 'other-query';
            if (binding === 'artifact') input.artifactUuid = 'other-artifact';
            if (binding === 'version') input.versionUuid = 'other-version';
            if (binding === 'creator') prompt.createdByUserUuid = 'other-user';
            if (binding === 'agent') prompt.agentUuid = 'other-agent';
            if (binding === 'thread') prompt.threadUuid = 'other-thread';
            if (binding === 'project') prompt.projectUuid = 'other-project';
            if (binding === 'finished') delivery.finished_at = new Date();
            await expect(
                service.getArtifactQueryResults(user, { ...options, page: 2 }),
            ).rejects.toThrow(ForbiddenError);
            expect(getDownloadStream).not.toHaveBeenCalled();
        },
    );

    it('allows the in-app conversation owner to view only their own configured agent composer results', async () => {
        const {
            service,
            user,
            options,
            artifact,
            prompt,
            producer,
            claim,
            getDownloadStream,
        } = setup();
        artifact.chartConfig = {
            source: 'composer',
            schemaVersion: 1,
            queries: [],
            terminalNodeId: 'source',
            lastQueryUuid: 'execution',
            nodeResults: { source: { queryUuid: 'execution' } },
        } as typeof artifact.chartConfig;
        delete (prompt as Partial<SlackPrompt>).slackUserId;
        producer.agentIdentity = buildAgentIdentityClaim({
            subject: claim.subject,
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: AGENT_CLIENT_IDS[AgentActorSurface.IN_APP_AGENT],
            agentUuid: 'agent',
        });
        const results = await service.getArtifactQueryResults(user, {
            ...options,
            cached: false,
        });
        expect(results).toMatchObject({
            status: QueryHistoryStatus.READY,
            rows: [{}],
        });
        getDownloadStream.mockClear();
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                queryUuid: 'unbound-query',
                cached: false,
            }),
        ).rejects.toThrow(ForbiddenError);
        producer.agentIdentity.act.agent_uuid = 'another-agent';
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).rejects.toThrow(/Run the query again\.$/);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });

    it('keeps an agent admin viewing another conversation as a person reader', async () => {
        const { service, user, options, artifact, thread, getDownloadStream } =
            setup();
        artifact.chartConfig = {
            source: 'composer',
            schemaVersion: 1,
            queries: [],
            terminalNodeId: 'source',
            lastQueryUuid: 'execution',
        } as typeof artifact.chartConfig;
        thread.user.uuid = 'another-user';
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).rejects.toThrow(/Run the query again\.$/);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });

    it('binds an owner rerun to the checked thread agent and ignores a forged request actor', async () => {
        const {
            service,
            asyncService,
            user,
            options,
            artifact,
            prompt,
            history,
            producer,
            getDownloadStream,
        } = setup();
        artifact.chartConfig = { source: 'sql', sql: 'select 1', limit: 2 };
        delete (prompt as Partial<SlackPrompt>).slackUserId;
        vi.spyOn(asyncService, 'executeAsyncSqlQuery').mockImplementation(
            async () => {
                const scope = agentExecutionContext.getStore();
                expect(scope?.agentUuid).toBe('agent');
                expect(scope?.surface).toBe(AgentActorSurface.IN_APP_AGENT);
                producer.agentIdentity = scope!.claim;
                history.agentIdentity = scope!.claim;
                return {
                    queryUuid: 'execution',
                    fields: {},
                    cacheMetadata: { cacheHit: false },
                } as never;
            },
        );
        await service.getArtifactVizQuery(user, {
            ...options,
            ...{ agentActor: { agentUuid: 'forged-request-agent' } },
        });
        expect(history.agentIdentity?.act.agent_uuid).toBe('agent');
        expect(producer.agentIdentity).toEqual(history.agentIdentity);
        expect(agentExecutionContext.getStore()).toBeUndefined();
        expect(history.requestParameters.resultArtifact).toEqual({
            agentUuid: 'agent',
            artifactUuid: 'artifact',
            versionUuid: 'version',
        });
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).resolves.toMatchObject({
            status: QueryHistoryStatus.READY,
            rows: [{}],
        });
        getDownloadStream.mockClear();
        const binding = history.requestParameters.resultArtifact!;
        history.requestParameters.resultArtifact = undefined;
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).rejects.toThrow(/Run the query again\.$/);
        history.requestParameters.resultArtifact = binding;
        history.requestParameters.resultArtifact!.versionUuid =
            'another-version';
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });

    it('preserves flag-off person reads and limits the kill switch to producer matching', async () => {
        const {
            service,
            user,
            options,
            producer,
            claim,
            flags,
            config,
            input,
            getDownloadStream,
        } = setup();
        producer.agentIdentity = {
            ...claim,
            act: { ...claim.act, agent_uuid: 'another-agent' },
        };
        config.ai.agentResultIdentityCheckEnabled = false;
        await expect(
            service.getArtifactQueryResults(user, options),
        ).resolves.toMatchObject({ status: QueryHistoryStatus.READY });
        flags.enabled = false;
        await expect(
            service.getArtifactQueryResults(user, options),
        ).resolves.toMatchObject({ status: QueryHistoryStatus.READY });
        getDownloadStream.mockClear();
        input.queryUuid = 'changed-query';
        await expect(
            service.getArtifactQueryResults(user, options),
        ).rejects.toThrow(ForbiddenError);
        expect(getDownloadStream).not.toHaveBeenCalled();
    });
    it('keeps a non-owner rerun as a person despite a forged request agent UUID', async () => {
        const {
            service,
            asyncService,
            user,
            options,
            artifact,
            thread,
            producer,
            history,
        } = setup();
        artifact.chartConfig = { source: 'sql', sql: 'select 1', limit: 2 };
        thread.user.uuid = 'another-owner';
        const execute = vi
            .spyOn(asyncService, 'executeAsyncSqlQuery')
            .mockImplementation(async () => {
                const scope = agentExecutionContext.getStore();
                expect(scope).toBeUndefined();
                producer.agentIdentity = null;
                history.agentIdentity = null;
                return {
                    queryUuid: 'execution',
                    fields: {},
                    cacheMetadata: { cacheHit: false },
                } as never;
            });
        await service.getArtifactVizQuery(user, {
            ...options,
            ...{ agentActor: { agentUuid: 'forged-request-agent' } },
        });
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0][0]).not.toHaveProperty('agentActor');
        expect(history.agentIdentity).toBeNull();
        expect(producer.agentIdentity).toBeNull();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });

    it('rejects a person read of an owner semantic rerun and permits its artifact-scoped read', async () => {
        const {
            service,
            asyncService,
            user,
            options,
            artifact,
            prompt,
            producer,
            history,
            getDownloadStream,
        } = setup();
        artifact.chartConfig = {
            source: 'semantic',
            config: {
                title: 'Orders',
                description: 'Orders',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 2,
                    parameters: null,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
        } as typeof artifact.chartConfig;
        delete (prompt as Partial<SlackPrompt>).slackUserId;
        vi.spyOn(
            service as unknown as {
                executeAsyncAiMetricQuery: () => Promise<unknown>;
            },
            'executeAsyncAiMetricQuery',
        ).mockImplementation(async () => {
            const scope = agentExecutionContext.getStore();
            expect(scope?.agentUuid).toBe('agent');
            expect(scope?.surface).toBe(AgentActorSurface.IN_APP_AGENT);
            producer.agentIdentity = scope!.claim;
            history.agentIdentity = scope!.claim;
            return {
                queryUuid: 'execution',
                fields: {},
                cacheMetadata: { cacheHit: false },
            } as never;
        });
        await service.getArtifactVizQuery(user, options);
        expect(agentExecutionContext.getStore()).toBeUndefined();
        await expect(
            asyncService.getAsyncQueryResults({
                account: fromSession(user),
                projectUuid: 'project',
                queryUuid: 'execution',
            }),
        ).rejects.toThrow(/Run the query again\.$/);
        expect(getDownloadStream).not.toHaveBeenCalled();
        await expect(
            service.getArtifactQueryResults(user, {
                ...options,
                cached: false,
            }),
        ).resolves.toMatchObject({
            status: QueryHistoryStatus.READY,
            rows: [{}],
        });
        expect(getDownloadStream).toHaveBeenCalledTimes(1);
    });
});
