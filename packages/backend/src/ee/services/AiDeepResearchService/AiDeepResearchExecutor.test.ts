import {
    AnyType,
    type AiDeepResearchExecutionContextSnapshot,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import Logger from '../../../logging/logger';
import { type DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import { AiDeepResearchExecutor } from './AiDeepResearchExecutor';
import { AiDeepResearchPermanentError } from './errors';

const snapshot: AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1,
    userUuid: defaultSessionUser.userUuid,
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    promptUuid: 'prompt-1',
    agentName: 'Analyst',
    agentInstruction: 'Investigate carefully',
    agentVersion: 1,
    agentTags: [],
    executionMode: 'deep_research',
    enableDataAccess: true,
    enableContentTools: true,
    enableSelfImprovement: false,
    modelProvider: 'anthropic',
    modelName: 'anthropic/claude',
    enabledTools: ['runMetricQuery'],
    mcpServers: [
        {
            uuid: 'mcp-1',
            name: 'CRM',
            authType: 'oauth',
        },
    ],
    knowledgeDocumentUuids: ['document-1'],
    knowledgeDocuments: [
        {
            uuid: 'document-1',
            name: 'Metric guide',
            updatedAt: '2026-07-15T12:00:00.000Z',
        },
    ],
    projectContextEnabled: true,
    projectContextEntryCount: 1,
    repositoryAccessEnabled: true,
    repositoryRoot: '.',
    repositorySupportsCodeSearch: true,
    canRunSql: true,
    permissions: {
        canManageAgent: false,
        canRunSql: true,
        canUseContentTools: true,
        canUseDataTools: true,
        canUseRepository: true,
        canUseWriteback: false,
    },
    resolvedAt: '2026-07-15T12:00:00.000Z',
};

const run = (
    overrides: Partial<DbAiDeepResearchRun> = {},
): DbAiDeepResearchRun => ({
    ai_deep_research_run_uuid: 'run-1',
    organization_uuid: defaultSessionUser.organizationUuid ?? 'org-1',
    project_uuid: 'project-1',
    created_by_user_uuid: defaultSessionUser.userUuid,
    agent_uuid: 'agent-1',
    ai_thread_uuid: 'thread-1',
    prompt_uuid: 'prompt-1',
    tool_call_id: null,
    prompt: 'Why did revenue fall?',
    status: 'running',
    claude_session_id: null,
    result: null,
    budget_snapshot: {
        maxRuntimeMs: 60_000,
        maxTokens: 10_000,
        maxToolCalls: 10,
        maxWarehouseQueries: 3,
        maxResultRows: 250,
    },
    policy_snapshot: {
        instructions: null,
        maxSteps: 40,
        maxToolCalls: 10,
        maxWarehouseQueries: 3,
        maxRuntimeMs: 60_000,
    },
    execution_context_snapshot: null,
    checkpoint: null,
    timings: null,
    execution_attempts: 1,
    policy_limit_reached: null,
    error_message: null,
    cancellation_requested_at: null,
    started_at: new Date('2026-07-15T12:00:01.000Z'),
    completed_at: null,
    created_at: new Date('2026-07-15T12:00:00.000Z'),
    updated_at: new Date('2026-07-15T12:00:01.000Z'),
    ...overrides,
});

const submittedArtifact = {
    findings: ['A price change reduced conversion'],
    evidence: [
        {
            title: 'Model-supplied claim',
            summary: 'This reference must be reconciled.',
            sourceType: 'warehouse' as const,
            toolName: 'inventedTool',
            toolCallId: 'invented-call',
            mcpServerUuid: 'invented-server',
            queryUuid: 'invented-query',
        },
    ],
    queryUuids: ['invented-query'],
    metricDefinitions: [],
    hypotheses: ['The price change caused the decline'],
    contradictions: [],
    confidence: 'high' as const,
    limitations: [],
    finalReport: '# Root cause\n\nA price change reduced conversion.',
};

const buildExecutor = () => {
    const aiDeepResearchRunModel = {
        appendEvent: vi.fn().mockResolvedValue(true),
        saveArtifactWithEvents: vi.fn().mockResolvedValue(true),
        saveCheckpoint: vi.fn().mockResolvedValue(true),
        saveExecutionContext: vi.fn().mockResolvedValue(true),
        savePolicyLimitReached: vi.fn().mockResolvedValue(true),
        saveTimings: vi.fn().mockResolvedValue(true),
        touch: vi.fn().mockResolvedValue(true),
    };
    const aiAgentModel = {
        findWebAppPrompt: vi.fn().mockResolvedValue({ response: null }),
        clearModelResponse: vi.fn().mockResolvedValue(undefined),
        getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
            {
                toolCall: {
                    uuid: 'call-row-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    parentToolCallId: null,
                    createdAt: new Date(),
                    toolArgs: {},
                    toolType: 'built-in',
                    toolName: 'runMetricQuery',
                },
                toolResult: {
                    uuid: 'result-1',
                    promptUuid: 'prompt-1',
                    result: JSON.stringify({ queryUuid: 'query-1', rows: [] }),
                    createdAt: new Date(),
                    toolCallId: 'call-1',
                    toolType: 'built-in',
                    toolName: 'runMetricQuery',
                    metadata: null,
                },
                approvalDecision: null,
            },
            {
                toolCall: {
                    uuid: 'call-row-2',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-2',
                    parentToolCallId: null,
                    createdAt: new Date(),
                    toolArgs: submittedArtifact,
                    toolType: 'built-in',
                    toolName: 'submitResearchArtifact',
                },
                toolResult: {
                    uuid: 'result-2',
                    promptUuid: 'prompt-1',
                    result: JSON.stringify({ submitted: true }),
                    createdAt: new Date(),
                    toolCallId: 'call-2',
                    toolType: 'built-in',
                    toolName: 'submitResearchArtifact',
                    metadata: null,
                },
                approvalDecision: null,
            },
        ]),
        updateModelResponse: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentService = {
        interruptAgentThreadMessage: vi.fn().mockResolvedValue(undefined),
        generateAgentThreadResponse: vi
            .fn()
            .mockImplementation(async (_user, options) => {
                await options.onExecutionContextResolved(snapshot);
                options.onStepProgress(
                    'Running query',
                    'runMetricQuery',
                    'call-1',
                    'in_progress',
                );
                options.onStepProgress(
                    'Query complete',
                    'runMetricQuery',
                    'call-1',
                    'complete',
                );
                return '# Root cause\n\nA price change reduced conversion.';
            }),
    };
    const executor = new AiDeepResearchExecutor({
        aiAgentService: aiAgentService as AnyType,
        aiAgentModel: aiAgentModel as AnyType,
        aiDeepResearchRunModel: aiDeepResearchRunModel as AnyType,
        userService: {
            getSessionByUserUuidAndOrg: vi
                .fn()
                .mockResolvedValue(defaultSessionUser),
        } as AnyType,
    });

    return { executor, aiAgentService, aiAgentModel, aiDeepResearchRunModel };
};

describe('AiDeepResearchExecutor', () => {
    it('runs with the existing AI Agent context and creates query provenance', async () => {
        const { executor, aiAgentService, aiDeepResearchRunModel } =
            buildExecutor();

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(aiAgentService.generateAgentThreadResponse).toHaveBeenCalledWith(
            defaultSessionUser,
            expect.objectContaining({
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
            }),
        );
        expect(
            aiDeepResearchRunModel.saveExecutionContext,
        ).toHaveBeenCalledWith('run-1', snapshot);
        expect(result).toMatchObject({
            status: 'completed',
            artifact: {
                findings: ['A price change reduced conversion'],
                queryUuids: ['query-1'],
                confidence: 'high',
            },
        });
        expect(
            result.status === 'completed' && result.artifact.evidence[0],
        ).toMatchObject({
            toolName: null,
            toolCallId: null,
            mcpServerUuid: null,
            queryUuid: null,
        });
        expect(
            aiDeepResearchRunModel.saveArtifactWithEvents,
        ).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({
                finalReport: submittedArtifact.finalReport,
            }),
            [
                {
                    queryUuid: 'query-1',
                    toolCallId: 'call-1',
                    toolName: 'runMetricQuery',
                },
            ],
        );
    });

    it('reuses a persisted artifact on retry without another model call', async () => {
        const { executor, aiAgentService } = buildExecutor();
        const existingArtifact = {
            findings: [],
            evidence: [],
            queryUuids: [],
            metricDefinitions: [],
            hypotheses: [],
            contradictions: [],
            confidence: 'medium' as const,
            limitations: [],
            finalReport: 'Already complete',
        };

        const result = await executor.execute(
            run({ result: existingArtifact, checkpoint: 'thread_attached' }),
            { signal: new AbortController().signal },
        );

        expect(result).toEqual({
            status: 'completed',
            artifact: existingArtifact,
        });
        expect(
            aiAgentService.generateAgentThreadResponse,
        ).not.toHaveBeenCalled();
    });

    it('resumes from an artifact checkpoint by attaching the persisted report', async () => {
        const { executor, aiAgentService, aiAgentModel } = buildExecutor();

        const result = await executor.execute(
            run({ result: submittedArtifact, checkpoint: 'artifact_created' }),
            { signal: new AbortController().signal },
        );

        expect(result).toEqual({
            status: 'completed',
            artifact: submittedArtifact,
        });
        expect(
            aiAgentService.generateAgentThreadResponse,
        ).not.toHaveBeenCalled();
        expect(aiAgentModel.updateModelResponse).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            response: submittedArtifact.finalReport,
        });
    });

    it('stops before an over-budget tool and returns a partial artifact', async () => {
        const {
            executor,
            aiAgentService,
            aiAgentModel,
            aiDeepResearchRunModel,
        } = buildExecutor();
        aiAgentService.generateAgentThreadResponse.mockImplementation(
            async (_user, options) => {
                await options.onExecutionContextResolved(snapshot);
                await options.onStepProgress(
                    'First tool',
                    'runMetricQuery',
                    'call-1',
                    'in_progress',
                );
                await options.onStepProgress(
                    'Second tool',
                    'runMetricQuery',
                    'call-2',
                    'in_progress',
                );
            },
        );
        // An interrupted investigation never reached submitResearchArtifact.
        aiAgentModel.getToolCallsAndResultsForPrompt.mockResolvedValue([
            {
                toolCall: {
                    uuid: 'call-row-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    parentToolCallId: null,
                    createdAt: new Date(),
                    toolArgs: {},
                    toolType: 'built-in',
                    toolName: 'runMetricQuery',
                },
                toolResult: null,
                approvalDecision: null,
            },
        ]);

        const result = await executor.execute(
            run({
                policy_snapshot: {
                    instructions: null,
                    maxSteps: 40,
                    maxToolCalls: 1,
                    maxWarehouseQueries: 3,
                    maxRuntimeMs: 60_000,
                },
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            artifact: {
                limitations: ['The tool or step policy limit was reached.'],
            },
        });
        expect(
            aiAgentService.interruptAgentThreadMessage,
        ).toHaveBeenCalledOnce();
        expect(
            aiDeepResearchRunModel.savePolicyLimitReached,
        ).toHaveBeenCalledWith(
            'run-1',
            'The tool or step policy limit was reached.',
        );
    });

    it('does not double-count repeated progress events for the same tool call', async () => {
        const { executor, aiAgentService, aiDeepResearchRunModel } =
            buildExecutor();
        aiAgentService.generateAgentThreadResponse.mockImplementation(
            async (_user, options) => {
                await options.onExecutionContextResolved(snapshot);
                // Same toolCallId reported repeatedly plus mid-tool progress
                // without an id — together they count as ONE tool call.
                await options.onStepProgress(
                    'First tool',
                    'runMetricQuery',
                    'call-1',
                    'in_progress',
                );
                await options.onStepProgress(
                    'Still running',
                    'runMetricQuery',
                    'call-1',
                    'in_progress',
                );
                await options.onStepProgress('Running SQL query…', 'runSql');
                await options.onStepProgress(
                    'Query complete',
                    'runMetricQuery',
                    'call-1',
                    'complete',
                );
            },
        );

        const result = await executor.execute(
            run({
                policy_snapshot: {
                    instructions: null,
                    maxSteps: 40,
                    maxToolCalls: 1,
                    maxWarehouseQueries: 3,
                    maxRuntimeMs: 60_000,
                },
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({ status: 'completed' });
        expect(
            aiAgentService.interruptAgentThreadMessage,
        ).not.toHaveBeenCalled();
        const toolCallEvents = aiDeepResearchRunModel.appendEvent.mock.calls
            .filter(([, eventType]) => eventType === 'tool_call')
            .map(([, , payload]) => payload);
        // The id-less mid-tool progress line never becomes a tool_call event.
        expect(toolCallEvents).toHaveLength(3);
        expect(
            toolCallEvents.every(
                (payload) => (payload as AnyType).toolCallId === 'call-1',
            ),
        ).toBe(true);
    });

    it('completes a run whose researcher submitted before a tripped runtime limit interrupted it', async () => {
        const { executor, aiDeepResearchRunModel } = buildExecutor();

        const result = await executor.execute(
            run({
                checkpoint: 'research_completed',
                execution_context_snapshot: snapshot,
                policy_limit_reached: 'The runtime policy limit was reached.',
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({ status: 'completed' });
        expect(
            result.status === 'completed' && result.artifact.limitations,
        ).toEqual([]);
        expect(
            aiDeepResearchRunModel.savePolicyLimitReached,
        ).toHaveBeenCalledWith('run-1', null);
    });

    it('rebuilds the artifact from persisted tool rows after a research_completed checkpoint', async () => {
        const { executor, aiAgentService } = buildExecutor();

        const result = await executor.execute(
            run({
                checkpoint: 'research_completed',
                execution_context_snapshot: snapshot,
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({ status: 'completed' });
        expect(
            aiAgentService.generateAgentThreadResponse,
        ).not.toHaveBeenCalled();
    });

    it('returns cancelled without generating when the signal is already aborted', async () => {
        const { executor, aiAgentService } = buildExecutor();
        const abortController = new AbortController();
        abortController.abort();

        const result = await executor.execute(run(), {
            signal: abortController.signal,
        });

        expect(result).toEqual({ status: 'cancelled' });
        expect(
            aiAgentService.generateAgentThreadResponse,
        ).not.toHaveBeenCalled();
    });

    it('returns cancelled without generating when cancellation was already requested', async () => {
        const { executor, aiAgentService } = buildExecutor();

        const result = await executor.execute(
            run({ cancellation_requested_at: new Date() }),
            { signal: new AbortController().signal },
        );

        expect(result).toEqual({ status: 'cancelled' });
        expect(
            aiAgentService.generateAgentThreadResponse,
        ).not.toHaveBeenCalled();
    });

    it('fails the run when the execution context is never resolved', async () => {
        const { executor, aiAgentService, aiDeepResearchRunModel } =
            buildExecutor();
        aiAgentService.generateAgentThreadResponse.mockResolvedValue(undefined);

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toEqual({
            status: 'failed',
            errorMessage: 'AI Agent execution context was not resolved',
        });
        expect(
            aiDeepResearchRunModel.saveArtifactWithEvents,
        ).not.toHaveBeenCalled();
    });

    it('throws a permanent error when the submitted artifact fails validation', async () => {
        const { executor, aiAgentModel, aiDeepResearchRunModel } =
            buildExecutor();
        aiAgentModel.getToolCallsAndResultsForPrompt.mockResolvedValue([
            {
                toolCall: {
                    uuid: 'call-row-1',
                    promptUuid: 'prompt-1',
                    toolCallId: 'call-1',
                    parentToolCallId: null,
                    createdAt: new Date(),
                    toolArgs: { finalReport: '' },
                    toolType: 'built-in',
                    toolName: 'submitResearchArtifact',
                },
                toolResult: null,
                approvalDecision: null,
            },
        ]);

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).rejects.toBeInstanceOf(AiDeepResearchPermanentError);
        expect(
            aiDeepResearchRunModel.saveArtifactWithEvents,
        ).not.toHaveBeenCalled();
    });

    it('stops on a breached warehouse query limit and returns a partial artifact', async () => {
        const {
            executor,
            aiAgentService,
            aiAgentModel,
            aiDeepResearchRunModel,
        } = buildExecutor();
        aiAgentService.generateAgentThreadResponse.mockImplementation(
            async (_user, options) => {
                await options.onExecutionContextResolved(snapshot);
                await options.onStepProgress(
                    'First query',
                    'runSql',
                    'call-1',
                    'in_progress',
                );
                await options.onStepProgress(
                    'Second query',
                    'runContentQuery',
                    'call-2',
                    'in_progress',
                );
            },
        );
        aiAgentModel.getToolCallsAndResultsForPrompt.mockResolvedValue([]);

        const result = await executor.execute(
            run({
                policy_snapshot: {
                    instructions: null,
                    maxSteps: 40,
                    maxToolCalls: 10,
                    maxWarehouseQueries: 1,
                    maxRuntimeMs: 60_000,
                },
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            artifact: {
                limitations: ['The warehouse query policy limit was reached.'],
            },
        });
        expect(
            aiDeepResearchRunModel.savePolicyLimitReached,
        ).toHaveBeenCalledWith(
            'run-1',
            'The warehouse query policy limit was reached.',
        );
        expect(
            aiAgentService.interruptAgentThreadMessage,
        ).toHaveBeenCalledOnce();
    });

    describe('timers', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-07-15T12:00:51.000Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        const pendingGeneration = () => {
            let finish!: () => void;
            const generation = new Promise<void>((resolve) => {
                finish = resolve;
            });
            return { generation, finish };
        };

        it('interrupts on the runtime limit anchored to the first attempt start', async () => {
            const {
                executor,
                aiAgentService,
                aiAgentModel,
                aiDeepResearchRunModel,
            } = buildExecutor();
            const { generation, finish } = pendingGeneration();
            aiAgentService.generateAgentThreadResponse.mockImplementation(
                async (_user, options) => {
                    await options.onExecutionContextResolved(snapshot);
                    return generation;
                },
            );
            aiAgentModel.getToolCallsAndResultsForPrompt.mockResolvedValue([]);

            // started_at is 50s in the past, so only 10s of the 60s runtime
            // budget remains for this attempt.
            const execution = executor.execute(
                run({ started_at: new Date('2026-07-15T12:00:01.000Z') }),
                { signal: new AbortController().signal },
            );

            await vi.advanceTimersByTimeAsync(9_000);
            expect(
                aiDeepResearchRunModel.savePolicyLimitReached,
            ).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1_000);
            expect(
                aiDeepResearchRunModel.savePolicyLimitReached,
            ).toHaveBeenCalledWith(
                'run-1',
                'The runtime policy limit was reached.',
            );
            expect(
                aiAgentService.interruptAgentThreadMessage,
            ).toHaveBeenCalledOnce();

            finish();
            const result = await execution;
            expect(result).toMatchObject({
                status: 'partially_completed',
                artifact: {
                    limitations: ['The runtime policy limit was reached.'],
                },
            });
        });

        it('touches the heartbeat every 15 seconds and logs a failed touch instead of crashing', async () => {
            const { executor, aiAgentService, aiDeepResearchRunModel } =
                buildExecutor();
            const loggerErrorSpy = vi
                .spyOn(Logger, 'error')
                .mockImplementation(() => Logger);
            const { generation, finish } = pendingGeneration();
            aiAgentService.generateAgentThreadResponse.mockImplementation(
                async (_user, options) => {
                    await options.onExecutionContextResolved(snapshot);
                    return generation;
                },
            );

            const execution = executor.execute(
                run({ started_at: new Date('2026-07-15T12:00:51.000Z') }),
                { signal: new AbortController().signal },
            );

            await vi.advanceTimersByTimeAsync(15_000);
            expect(aiDeepResearchRunModel.touch).toHaveBeenCalledTimes(1);

            aiDeepResearchRunModel.touch.mockRejectedValueOnce(
                new Error('connection reset'),
            );
            await vi.advanceTimersByTimeAsync(15_000);
            expect(aiDeepResearchRunModel.touch).toHaveBeenCalledTimes(2);
            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('heartbeat failed'),
            );

            finish();
            const result = await execution;
            expect(result).toMatchObject({ status: 'completed' });
            loggerErrorSpy.mockRestore();
        });
    });
});
