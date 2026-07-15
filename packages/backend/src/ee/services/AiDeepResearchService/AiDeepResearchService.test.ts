import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AnyType,
    FeatureFlags,
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
    const service = new AiDeepResearchService({
        aiDeepResearchRunModel: model as AnyType,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
        } as AnyType,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({
                id: FeatureFlags.AiDeepResearch,
                enabled: true,
            }),
        } as AnyType,
        schedulerClient: schedulerClient as AnyType,
        aiAgentService: aiAgentService as AnyType,
        aiAgentModel: aiAgentModel as AnyType,
        analytics: { track: vi.fn() } as AnyType,
        executor,
    });

    return {
        service,
        model,
        aiAgentService,
        aiAgentModel,
        schedulerClient,
        executor,
    };
};

describe('AiDeepResearchService', () => {
    it('creates a hidden AI Agent prompt before enqueueing the durable run', async () => {
        const { service, model, aiAgentService, schedulerClient } =
            buildService();

        const result = await service.createRun({
            user: user(),
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            threadUuid: 'thread-1',
            prompt: 'Why did revenue fall?',
        });

        expect(aiAgentService.getAgent).toHaveBeenCalledWith(
            expect.anything(),
            'agent-1',
            'project-1',
        );
        expect(aiAgentService.createAgentThreadMessage).toHaveBeenCalledWith(
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

    it('finishes an execution with the persisted Research Artifact', async () => {
        const { service, model, executor } = buildService();

        await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

        expect(executor).toHaveBeenCalledOnce();
        expect(model.markCompleted).toHaveBeenCalledWith('run-1', artifact);
    });

    it('does not execute a run that is already terminal or actively claimed', async () => {
        const { service, model, executor } = buildService();
        model.claimRun.mockResolvedValue(undefined);

        await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

        expect(executor).not.toHaveBeenCalled();
    });

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

    it('rejects a new run while the thread already has an active one', async () => {
        const { service, model, aiAgentService } = buildService();
        model.findActiveRunByThread.mockResolvedValue(
            run({ status: 'running' }),
        );

        await expect(
            service.createRun({
                user: user(),
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                prompt: 'Why did revenue fall?',
            }),
        ).rejects.toThrow(
            'Thread thread-1 already has an active Deep Research run',
        );
        expect(aiAgentService.createAgentThreadMessage).not.toHaveBeenCalled();
        expect(model.create).not.toHaveBeenCalled();
    });

    it('marks the orphaned hidden prompt when enqueueing fails', async () => {
        const { service, model, aiAgentModel, schedulerClient } =
            buildService();
        schedulerClient.aiDeepResearch.mockRejectedValue(
            new Error('queue unavailable'),
        );

        await expect(
            service.createRun({
                user: user(),
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                prompt: 'Why did revenue fall?',
            }),
        ).rejects.toThrow('queue unavailable');

        expect(model.markFailed).toHaveBeenCalledOnce();
        expect(aiAgentModel.updateModelResponse).toHaveBeenCalledWith(
            expect.objectContaining({ promptUuid: 'prompt-1' }),
        );
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
});
