import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AlreadyProcessingError,
    AnyType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type AiDeepResearchArtifact,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { AiDeepResearchService } from './AiDeepResearchService';
import { AiDeepResearchPermanentError } from './errors';

const artifact: AiDeepResearchArtifact = {
    findings: ['Revenue fell after a price change'],
    evidence: [],
    queryUuids: [],
    metricDefinitions: [],
    hypotheses: [],
    contradictions: [],
    confidence: 'high',
    limitations: [],
    finalReport: '# Root cause\n\nRevenue fell after a price change.',
};

const user = (): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('view', 'Project', {
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
    });
    can('create', 'AiDeepResearch', {
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
    });
    return {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        organizationName: 'Acme',
        organizationCreatedAt: new Date(),
        role: 'member',
        ability: build(),
    } as AnyType;
};

const userWithAbility = (
    grant: (can: AbilityBuilder<MemberAbility>['can']) => void,
): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    grant(can);
    return { ...user(), ability: build() } as SessionUser;
};

const run = (overrides: Record<string, unknown> = {}) => ({
    ai_deep_research_run_uuid: 'run-1',
    organization_uuid: 'org-1',
    project_uuid: 'project-1',
    created_by_user_uuid: 'user-1',
    agent_uuid: 'agent-1',
    ai_thread_uuid: 'thread-1',
    prompt_uuid: 'prompt-1',
    tool_call_id: null,
    prompt: 'Why did revenue fall?',
    status: 'queued',
    claude_session_id: null,
    result: null,
    budget_snapshot: {
        maxRuntimeMs: 1_800_000,
        maxTokens: 1_000_000,
        maxToolCalls: 125,
        maxWarehouseQueries: 25,
        maxResultRows: 10_000,
    },
    policy_snapshot: {
        instructions: null,
        maxSteps: 40,
        maxToolCalls: 125,
        maxWarehouseQueries: 25,
        maxRuntimeMs: 1_800_000,
    },
    execution_context_snapshot: null,
    checkpoint: null,
    timings: null,
    execution_attempts: 0,
    error_message: null,
    cancellation_requested_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-07-15T12:00:00.000Z'),
    updated_at: new Date('2026-07-15T12:00:00.000Z'),
    ...overrides,
});

const buildService = (
    executor = vi.fn().mockResolvedValue({ status: 'completed', artifact }),
) => {
    const model = {
        create: vi.fn().mockResolvedValue(run()),
        findByUuid: vi.fn().mockResolvedValue(run()),
        findByUuidScoped: vi.fn().mockResolvedValue(run()),
        findActiveRunByThread: vi.fn().mockResolvedValue(undefined),
        claimRun: vi.fn().mockResolvedValue(run({ status: 'running' })),
        markCompleted: vi.fn().mockResolvedValue(true),
        markPartiallyCompleted: vi.fn().mockResolvedValue(true),
        markFailed: vi.fn().mockResolvedValue(true),
        markCancelled: vi.fn().mockResolvedValue(true),
        requestCancellation: vi
            .fn()
            .mockResolvedValue({ run: run(), cancelledQueuedRun: false }),
        listEvents: vi.fn().mockResolvedValue([]),
        markStaleRunsAsFailed: vi.fn().mockResolvedValue([]),
        touch: vi.fn().mockResolvedValue(true),
        releaseForRetry: vi.fn().mockResolvedValue(true),
        saveTimings: vi.fn().mockResolvedValue(true),
    };
    const aiAgentService = {
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-1',
            projectUuid: 'project-1',
        }),
        createAgentThreadMessage: vi
            .fn()
            .mockResolvedValue({ uuid: 'prompt-1' }),
        interruptAgentThreadMessage: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentModel = {
        updateModelResponse: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        aiDeepResearch: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org-1' }),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({
            id: FeatureFlags.AiDeepResearch,
            enabled: true,
        }),
    };
    const analytics = { track: vi.fn() };
    const service = new AiDeepResearchService({
        aiDeepResearchRunModel: model as AnyType,
        projectModel: projectModel as AnyType,
        featureFlagModel: featureFlagModel as AnyType,
        schedulerClient: schedulerClient as AnyType,
        aiAgentService: aiAgentService as AnyType,
        aiAgentModel: aiAgentModel as AnyType,
        analytics: analytics as AnyType,
        executor,
    });

    return {
        service,
        model,
        aiAgentService,
        aiAgentModel,
        schedulerClient,
        projectModel,
        featureFlagModel,
        analytics,
        executor,
    };
};

const createRunArgs = (overrides: Record<string, unknown> = {}) => ({
    user: user(),
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    prompt: 'Why did revenue fall?',
    ...overrides,
});

const runFinishedEvents = (analytics: { track: ReturnType<typeof vi.fn> }) =>
    analytics.track.mock.calls.filter(
        ([event]) => event.event === 'ai_deep_research.run_finished',
    );

describe('AiDeepResearchService', () => {
    describe('createRun', () => {
        it('creates a hidden AI Agent prompt before enqueueing the durable run', async () => {
            const { service, model, aiAgentService, schedulerClient } =
                buildService();

            const result = await service.createRun(createRunArgs());

            expect(aiAgentService.getAgent).toHaveBeenCalledWith(
                expect.anything(),
                'agent-1',
                'project-1',
            );
            expect(
                aiAgentService.createAgentThreadMessage,
            ).toHaveBeenCalledWith(
                expect.anything(),
                'agent-1',
                'thread-1',
                expect.objectContaining({ hidden: true }),
            );
            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentUuid: 'agent-1',
                    aiThreadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                }),
            );
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledOnce();
            expect(result.aiDeepResearchRunUuid).toBe('run-1');
        });

        it('rejects a blank prompt before creating any prompt or run', async () => {
            const { service, model, aiAgentService } = buildService();

            await expect(
                service.createRun(createRunArgs({ prompt: '   ' })),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                aiAgentService.createAgentThreadMessage,
            ).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation when Deep Research is disabled', async () => {
            const { service, model, featureFlagModel } = buildService();
            featureFlagModel.get.mockResolvedValue({
                id: FeatureFlags.AiDeepResearch,
                enabled: false,
            });

            await expect(
                service.createRun(createRunArgs()),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without the Deep Research scope', async () => {
            const { service, model, featureFlagModel } = buildService();
            const viewer = userWithAbility((can) => {
                can('view', 'Project', {
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                });
            });

            await expect(
                service.createRun(createRunArgs({ user: viewer })),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects a Deep Research scope granted for another project', async () => {
            const { service, model, featureFlagModel } = buildService();
            const otherProjectUser = userWithAbility((can) => {
                can('view', 'Project', {
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                });
                can('create', 'AiDeepResearch', {
                    organizationUuid: 'org-1',
                    projectUuid: 'project-2',
                });
            });

            await expect(
                service.createRun(createRunArgs({ user: otherProjectUser })),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without project view permission', async () => {
            const { service, model, featureFlagModel } = buildService();
            const noProjectUser = userWithAbility((can) => {
                can('create', 'AiDeepResearch', {
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                });
            });

            await expect(
                service.createRun(createRunArgs({ user: noProjectUser })),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects a new run while the thread already has an active one', async () => {
            const { service, model, aiAgentService } = buildService();
            model.findActiveRunByThread.mockResolvedValue(
                run({ status: 'running' }),
            );

            await expect(
                service.createRun(createRunArgs()),
            ).rejects.toBeInstanceOf(AlreadyProcessingError);
            expect(
                aiAgentService.createAgentThreadMessage,
            ).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('marks the orphaned hidden prompt when enqueueing fails', async () => {
            const { service, model, aiAgentModel, schedulerClient } =
                buildService();
            schedulerClient.aiDeepResearch.mockRejectedValue(
                new Error('queue unavailable'),
            );

            await expect(service.createRun(createRunArgs())).rejects.toThrow(
                'queue unavailable',
            );

            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
            );
            expect(aiAgentModel.updateModelResponse).toHaveBeenCalledWith(
                expect.objectContaining({ promptUuid: 'prompt-1' }),
            );
        });
    });

    describe('createRun policy validation', () => {
        it.each([
            ['maxSteps', 0],
            ['maxSteps', 41],
            ['maxToolCalls', -5],
            ['maxToolCalls', 12.5],
            ['maxToolCalls', 501],
            ['maxWarehouseQueries', 0],
            ['maxWarehouseQueries', 101],
            ['maxRuntimeMs', 60 * 60 * 1_000 + 1],
            ['maxRuntimeMs', 0.5],
        ])('rejects %s = %s before any persistence', async (limit, value) => {
            const { service, model, aiAgentService } = buildService();

            await expect(
                service.createRun(
                    createRunArgs({ policy: { [limit]: value } }),
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                aiAgentService.createAgentThreadMessage,
            ).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects instructions over 2000 characters', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun(
                    createRunArgs({
                        policy: { instructions: 'x'.repeat(2_001) },
                    }),
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('normalizes whitespace-only instructions to null', async () => {
            const { service, model } = buildService();

            await service.createRun(
                createRunArgs({ policy: { instructions: '   \n\t ' } }),
            );

            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    policy: expect.objectContaining({ instructions: null }),
                }),
            );
        });
    });

    describe('run access', () => {
        it('rechecks current AI Agent access before returning persisted research', async () => {
            const { service, aiAgentService } = buildService();
            aiAgentService.getAgent.mockRejectedValue(
                new Error('Agent access was revoked'),
            );

            await expect(
                service.getRun(user(), 'project-1', 'run-1'),
            ).rejects.toThrow('Agent access was revoked');
        });

        it('keeps legacy runs without an agent readable, skipping agent revalidation', async () => {
            const { service, model, aiAgentService } = buildService();
            model.findByUuidScoped.mockResolvedValue(run({ agent_uuid: null }));

            const result = await service.getRun(user(), 'project-1', 'run-1');

            expect(result.agentUuid).toBeNull();
            expect(aiAgentService.getAgent).not.toHaveBeenCalled();
        });

        it('does not expose a run through a different project path', async () => {
            const { service, model, projectModel } = buildService();
            model.findByUuidScoped.mockResolvedValue(undefined);

            await expect(
                service.getRun(user(), 'another-project', 'run-1'),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.findByUuidScoped).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'another-project',
            });
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it("does not expose another creator's run to a project viewer", async () => {
            const { service, model, projectModel } = buildService();
            model.findByUuidScoped.mockResolvedValue(
                run({ created_by_user_uuid: 'user-2' }),
            );

            await expect(
                service.getRun(user(), 'project-1', 'run-1'),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it("does not let a project viewer cancel another creator's run", async () => {
            const { service, model } = buildService();
            model.findByUuidScoped.mockResolvedValue(
                run({ created_by_user_uuid: 'user-2' }),
            );

            await expect(
                service.cancelRun(user(), 'project-1', 'run-1'),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.requestCancellation).not.toHaveBeenCalled();
        });
    });

    describe('cancelRun', () => {
        it('interrupts the agent thread when cancelling a running run', async () => {
            const { service, model, aiAgentService } = buildService();
            model.requestCancellation.mockResolvedValue({
                run: run({
                    status: 'running',
                    cancellation_requested_at: new Date(
                        '2026-07-15T12:05:00.000Z',
                    ),
                }),
                cancelledQueuedRun: false,
            });

            const result = await service.cancelRun(
                user(),
                'project-1',
                'run-1',
            );

            expect(
                aiAgentService.interruptAgentThreadMessage,
            ).toHaveBeenCalledWith(expect.anything(), {
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                messageUuid: 'prompt-1',
            });
            expect(result.status).toBe('running');
            expect(result.cancellationRequestedAt).not.toBeNull();
        });

        it('does not attempt an interrupt for legacy runs without an agent thread', async () => {
            const { service, model, aiAgentService } = buildService();
            model.findByUuidScoped.mockResolvedValue(
                run({ agent_uuid: null, ai_thread_uuid: null }),
            );
            model.requestCancellation.mockResolvedValue({
                run: run({
                    status: 'running',
                    agent_uuid: null,
                    ai_thread_uuid: null,
                    cancellation_requested_at: new Date(),
                }),
                cancelledQueuedRun: false,
            });

            await service.cancelRun(user(), 'project-1', 'run-1');

            expect(
                aiAgentService.interruptAgentThreadMessage,
            ).not.toHaveBeenCalled();
        });

        it('emits the finished analytics event once across a double cancel of a queued run', async () => {
            const { service, model, analytics } = buildService();
            const cancelledRun = run({
                status: 'cancelled',
                cancellation_requested_at: new Date('2026-07-15T12:05:00.000Z'),
                completed_at: new Date('2026-07-15T12:05:00.000Z'),
            });
            model.findByUuid.mockResolvedValue(cancelledRun);
            model.requestCancellation
                .mockResolvedValueOnce({
                    run: cancelledRun,
                    cancelledQueuedRun: true,
                })
                .mockResolvedValueOnce({
                    run: cancelledRun,
                    cancelledQueuedRun: false,
                });

            await service.cancelRun(user(), 'project-1', 'run-1');
            await service.cancelRun(user(), 'project-1', 'run-1');

            expect(runFinishedEvents(analytics)).toHaveLength(1);
        });
    });

    describe('executeRun', () => {
        it('finishes an execution with the persisted Research Artifact', async () => {
            const { service, model, executor, analytics } = buildService();
            model.findByUuid.mockResolvedValue(
                run({
                    status: 'completed',
                    started_at: new Date('2026-07-15T12:00:05.000Z'),
                    completed_at: new Date('2026-07-15T12:10:00.000Z'),
                }),
            );

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(executor).toHaveBeenCalledOnce();
            expect(model.markCompleted).toHaveBeenCalledWith('run-1', artifact);
            expect(runFinishedEvents(analytics)).toHaveLength(1);
        });

        it('does not execute a run that is already terminal or actively claimed', async () => {
            const { service, model, executor } = buildService();
            model.claimRun.mockResolvedValue(undefined);
            model.findByUuid.mockResolvedValue(run({ status: 'completed' }));

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(executor).not.toHaveBeenCalled();
        });

        it('marks the run failed when the executor reports a failed result', async () => {
            const { service, model } = buildService(
                vi.fn().mockResolvedValue({
                    status: 'failed',
                    errorMessage: 'execution context was not resolved',
                }),
            );

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
            );
            expect(model.releaseForRetry).not.toHaveBeenCalled();
        });

        it('lets a concurrent cancellation request win over completion', async () => {
            const { service, model } = buildService();
            model.markCompleted.mockResolvedValue(false);
            model.findByUuid.mockResolvedValue(
                run({
                    status: 'running',
                    cancellation_requested_at: new Date(),
                }),
            );

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCancelled).toHaveBeenCalledWith('run-1');
        });

        it('fails permanently when the researcher never submits a Research Artifact', async () => {
            const { service, model } = buildService(
                vi
                    .fn()
                    .mockRejectedValue(
                        new AiDeepResearchPermanentError(
                            'Deep Research finished without submitting a Research Artifact',
                        ),
                    ),
            );

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markFailed).toHaveBeenCalledOnce();
            expect(model.releaseForRetry).not.toHaveBeenCalled();
        });

        it('requeues a run after a transient execution error so Graphile can retry it', async () => {
            const error = new Error('provider unavailable');
            const { service, model } = buildService(
                vi.fn().mockRejectedValue(error),
            );

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toThrow(error);

            expect(model.releaseForRetry).toHaveBeenCalledWith('run-1');
            expect(model.markFailed).not.toHaveBeenCalled();
        });

        it('finishes an interrupted user-cancelled run as cancelled instead of retrying it', async () => {
            const { service, model } = buildService(
                vi.fn().mockRejectedValue(new Error('interrupted')),
            );
            model.findByUuid.mockResolvedValue(
                run({
                    status: 'running',
                    cancellation_requested_at: new Date(),
                }),
            );

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCancelled).toHaveBeenCalledWith('run-1');
            expect(model.releaseForRetry).not.toHaveBeenCalled();
        });

        it('does not emit finished analytics when the terminal transition did not happen', async () => {
            const { service, model, analytics } = buildService(
                vi.fn().mockResolvedValue({
                    status: 'failed',
                    errorMessage: 'boom',
                }),
            );
            model.markFailed.mockResolvedValue(false);

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(runFinishedEvents(analytics)).toHaveLength(0);
        });
    });

    describe('listEvents', () => {
        const eventRow = (overrides: Record<string, unknown> = {}) => ({
            ai_deep_research_event_uuid: '9323399d-2329-4fd1-aa22-840c014f36f1',
            ai_deep_research_run_uuid: 'run-1',
            event_type: 'status_changed',
            payload: { status: 'queued' },
            created_at: new Date('2026-07-15T12:00:00.000Z'),
            cursor_created_at: '2026-07-15 12:00:00.000001',
            ...overrides,
        });

        it('uses an opaque keyset cursor and excludes the lookahead row', async () => {
            const { service, model } = buildService();
            model.listEvents.mockResolvedValue([
                eventRow(),
                eventRow({
                    ai_deep_research_event_uuid:
                        '9323399d-2329-4fd1-aa22-840c014f36f2',
                    payload: { status: 'running' },
                    cursor_created_at: '2026-07-15 12:01:00.000001',
                }),
            ]);

            const page = await service.listEvents({
                user: user(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                limit: 1,
            });

            expect(page.events).toHaveLength(1);
            expect(page.nextCursor).not.toBeNull();
            expect(model.listEvents).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                cursor: null,
                limit: 1,
            });
        });

        it('keeps the current cursor when no new events are available', async () => {
            const { service } = buildService();
            const cursor = Buffer.from(
                JSON.stringify({
                    createdAt: '2026-07-15 12:00:00.000001',
                    eventUuid: '9323399d-2329-4fd1-aa22-840c014f36f1',
                }),
            ).toString('base64url');

            const page = await service.listEvents({
                user: user(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                cursor,
            });

            expect(page).toEqual({ events: [], nextCursor: cursor });
        });

        it('rejects malformed cursors', async () => {
            const { service, model } = buildService();

            await expect(
                service.listEvents({
                    user: user(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor: 'not-a-cursor',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.listEvents).not.toHaveBeenCalled();
        });

        it('rejects a cursor with a non-UUID event identifier', async () => {
            const { service, model } = buildService();
            const cursor = Buffer.from(
                JSON.stringify({
                    createdAt: '2026-07-15 12:00:00.000001',
                    eventUuid: 'not-a-uuid',
                }),
            ).toString('base64url');

            await expect(
                service.listEvents({
                    user: user(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.listEvents).not.toHaveBeenCalled();
        });
    });
});
