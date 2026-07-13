import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    FeatureFlags,
    NotFoundError,
    ParameterError,
    type AiDeepResearchBudget,
    type AiDeepResearchReport,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { AiDeepResearchService } from './AiDeepResearchService';

const budget: AiDeepResearchBudget = {
    maxRuntimeMs: 60_000,
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
};

const report: AiDeepResearchReport = {
    summary: 'Summary',
    findings: [],
    caveats: [],
    scope: 'Last month',
    unresolvedQuestions: [],
    nextSteps: [],
};

const userWithProjectAccess = (): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('view', 'Project', {
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

const runRow = (overrides: Record<string, unknown> = {}) => ({
    ai_deep_research_run_uuid: 'run-1',
    organization_uuid: 'org-1',
    project_uuid: 'project-1',
    created_by_user_uuid: 'user-1',
    ai_thread_uuid: null,
    prompt_uuid: null,
    tool_call_id: null,
    prompt: 'Investigate revenue',
    status: 'queued',
    claude_session_id: null,
    result: null,
    budget_snapshot: budget,
    error_message: null,
    cancellation_requested_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-07-13T12:00:00.000Z'),
    updated_at: new Date('2026-07-13T12:00:00.000Z'),
    ...overrides,
});

const buildService = (
    overrides: {
        model?: Record<string, unknown>;
        projectModel?: Record<string, unknown>;
        featureFlagModel?: Record<string, unknown>;
        schedulerClient?: Record<string, unknown>;
        executor?: AnyType;
    } = {},
) => {
    const model = {
        create: vi.fn().mockResolvedValue(runRow()),
        findByUuid: vi.fn().mockResolvedValue(runRow()),
        findByUuidScoped: vi.fn().mockResolvedValue(runRow()),
        claimQueuedRun: vi
            .fn()
            .mockResolvedValue(runRow({ status: 'running' })),
        markCompleted: vi.fn().mockResolvedValue(true),
        markPartiallyCompleted: vi.fn().mockResolvedValue(true),
        markFailed: vi.fn().mockResolvedValue(true),
        markCancelled: vi.fn().mockResolvedValue(true),
        requestCancellation: vi.fn().mockResolvedValue(
            runRow({
                status: 'cancelled',
                cancellation_requested_at: new Date(),
                completed_at: new Date(),
            }),
        ),
        listEvents: vi.fn().mockResolvedValue([]),
        appendProgressEvent: vi.fn().mockResolvedValue(true),
        setClaudeSessionId: vi.fn().mockResolvedValue(true),
        touch: vi.fn().mockResolvedValue(true),
        markStaleRunsAsFailed: vi.fn().mockResolvedValue([]),
        ...overrides.model,
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org-1' }),
        ...overrides.projectModel,
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({
            id: FeatureFlags.AiDeepResearch,
            enabled: true,
        }),
        ...overrides.featureFlagModel,
    };
    const schedulerClient = {
        aiDeepResearch: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
        ...overrides.schedulerClient,
    };
    const executor =
        overrides.executor ??
        vi.fn().mockResolvedValue({
            status: 'completed',
            report,
        });
    const service = new AiDeepResearchService({
        aiDeepResearchRunModel: model as AnyType,
        projectModel: projectModel as AnyType,
        featureFlagModel: featureFlagModel as AnyType,
        schedulerClient: schedulerClient as AnyType,
        executor,
    });
    return {
        service,
        model,
        projectModel,
        featureFlagModel,
        schedulerClient,
        executor,
    };
};

describe('AiDeepResearchService', () => {
    describe('createRun', () => {
        it('persists the run before enqueueing a uniquely addressable job', async () => {
            const { service, model, schedulerClient, featureFlagModel } =
                buildService();

            const run = await service.createRun({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                prompt: '  Investigate revenue  ',
                budget,
            });

            expect(model.create).toHaveBeenCalledWith({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                createdByUserUuid: 'user-1',
                aiThreadUuid: null,
                promptUuid: null,
                toolCallId: null,
                prompt: 'Investigate revenue',
                budget,
            });
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            });
            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: expect.objectContaining({ userUuid: 'user-1' }),
                featureFlagId: FeatureFlags.AiDeepResearch,
            });
            expect(run.status).toBe('queued');
        });

        it('marks the durable run failed when enqueueing fails', async () => {
            const error = new Error('queue unavailable');
            const { service, model } = buildService({
                schedulerClient: {
                    aiDeepResearch: vi.fn().mockRejectedValue(error),
                },
            });

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget,
                }),
            ).rejects.toThrow('queue unavailable');
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
            );
        });

        it('rejects invalid budget snapshots before persistence', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget: { ...budget, maxTokens: 0 },
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });
    });

    describe('access and cancellation', () => {
        it('does not expose a run through a different project path', async () => {
            const { service, model, projectModel } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(undefined),
                },
            });

            await expect(
                service.getRun(
                    userWithProjectAccess(),
                    'another-project',
                    'run-1',
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.findByUuidScoped).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'another-project',
            });
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it('returns the model cancellation outcome for queued runs', async () => {
            const { service, model } = buildService();

            const run = await service.cancelRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(model.requestCancellation).toHaveBeenCalledWith('run-1');
            expect(run.status).toBe('cancelled');
            expect(run.cancellationRequestedAt).not.toBeNull();
        });

        it("does not expose another creator's run to a project viewer", async () => {
            const { service, projectModel } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ created_by_user_uuid: 'user-2' }),
                        ),
                },
            });

            await expect(
                service.getRun(userWithProjectAccess(), 'project-1', 'run-1'),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it("does not let a project viewer cancel another creator's run", async () => {
            const { service, model } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ created_by_user_uuid: 'user-2' }),
                        ),
                },
            });

            await expect(
                service.cancelRun(
                    userWithProjectAccess(),
                    'project-1',
                    'run-1',
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.requestCancellation).not.toHaveBeenCalled();
        });
    });

    describe('executeRun', () => {
        it('skips duplicate delivery after another worker claims the run', async () => {
            const executor = vi.fn();
            const { service, model } = buildService({
                model: { claimQueuedRun: vi.fn().mockResolvedValue(undefined) },
                executor,
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(executor).not.toHaveBeenCalled();
            expect(model.markCompleted).not.toHaveBeenCalled();
        });

        it('persists an explicit completed executor result', async () => {
            const { service, model } = buildService();

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCompleted).toHaveBeenCalledWith('run-1', report);
        });

        it('lets a concurrent cancellation request win over completion', async () => {
            const { service, model } = buildService({
                model: {
                    markCompleted: vi.fn().mockResolvedValue(false),
                    findByUuid: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'running',
                            cancellation_requested_at: new Date(),
                        }),
                    ),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCancelled).toHaveBeenCalledWith('run-1');
        });

        it('persists executor failures and keeps the job failed', async () => {
            const error = new Error('executor failed');
            const { service, model } = buildService({
                executor: vi.fn().mockRejectedValue(error),
            });

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toThrow('executor failed');
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
            );
        });

        it('passes an abort signal to the executor', async () => {
            const abortController = new AbortController();
            const { service, executor } = buildService();

            await service.executeRun(
                { aiDeepResearchRunUuid: 'run-1' },
                abortController.signal,
            );

            expect(executor).toHaveBeenCalledWith(
                expect.objectContaining({
                    ai_deep_research_run_uuid: 'run-1',
                }),
                { signal: abortController.signal },
            );
        });
    });

    describe('listEvents', () => {
        it('uses an opaque keyset cursor and excludes the lookahead row', async () => {
            const { service, model } = buildService({
                model: {
                    listEvents: vi.fn().mockResolvedValue([
                        {
                            ai_deep_research_event_uuid: 'event-1',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'status_changed',
                            payload: { status: 'queued' },
                            created_at: new Date('2026-07-13T12:00:00.000Z'),
                        },
                        {
                            ai_deep_research_event_uuid: 'event-2',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'status_changed',
                            payload: { status: 'running' },
                            created_at: new Date('2026-07-13T12:01:00.000Z'),
                        },
                    ]),
                },
            });

            const page = await service.listEvents({
                user: userWithProjectAccess(),
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

        it('rejects malformed cursors', async () => {
            const { service } = buildService();

            await expect(
                service.listEvents({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor: 'not-a-cursor',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
        });

        it('rejects a cursor with a non-UUID event identifier', async () => {
            const { service, model } = buildService();
            const cursor = Buffer.from(
                JSON.stringify({
                    createdAt: '2026-07-13T12:00:00.000Z',
                    eventUuid: 'not-a-uuid',
                }),
            ).toString('base64url');

            await expect(
                service.listEvents({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.listEvents).not.toHaveBeenCalled();
        });
    });
});
