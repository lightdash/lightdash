import { type AppGeneratePipelineJobPayload } from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';
import { CODING_AGENT_COMPACTION_NARRATION } from './codingAgentSession';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const APP_UUID = 'app-uuid-1';
const THREAD_UUID = 'thread-uuid-1';
const SESSION_ID = 'session-1';
const VERSION = 7;

const makePayload = (): AppGeneratePipelineJobPayload => ({
    appUuid: APP_UUID,
    version: VERSION,
    projectUuid: 'proj-uuid-1',
    organizationUuid: 'org-uuid-1',
    userUuid: 'user-uuid-1',
    prompt: 'Add a total row',
    isIteration: true,
});

// A thread whose previous version read far more than the compaction
// threshold per turn, so this build summarizes its session before it generates.
function buildService(
    compactStdout: string,
    statusHistory: { kind: string; message: string }[] = [],
) {
    const statuses: string[] = [];
    const track = vi.fn();
    const appModel = {
        getApp: vi.fn().mockResolvedValue({
            app_id: APP_UUID,
            project_uuid: 'proj-uuid-1',
            organization_uuid: 'org-uuid-1',
            template: 'dashboard',
        }),
        getVersion: vi.fn().mockResolvedValue({
            version: VERSION,
            app_thread_uuid: THREAD_UUID,
            status_history: statusHistory,
        }),
        findThreadByUuid: vi.fn().mockResolvedValue({
            app_thread_uuid: THREAD_UUID,
            app_id: APP_UUID,
            thread_number: 2,
            coding_agent_session_id: SESSION_ID,
        }),
        threadHasVersionThatReachedCodingAgent: vi.fn().mockResolvedValue(true),
        hasCancelledVersionSinceLastReady: vi.fn().mockResolvedValue(false),
        findPreviousFinishedVersionInThread: vi.fn().mockResolvedValue({
            version: VERSION - 1,
            generationUsage: {
                inputTokens: 1_000,
                outputTokens: 5_000,
                cacheReadInputTokens: 1_200_000,
                cacheCreationInputTokens: 200_000,
                numTurns: 4,
                durationApiMs: 1_000,
                costUsd: 1,
            },
        }),
        updateVersionStatusIfInProgress: vi
            .fn()
            .mockImplementation(async (_app: string, _v: number, status) => {
                statuses.push(status);
                return true;
            }),
        getVersionStatus: vi.fn().mockResolvedValue('generating'),
        recordVersionGenerationUsage: vi.fn().mockResolvedValue(undefined),
        recordBuildNarration: vi.fn().mockResolvedValue(undefined),
        updateStatusMessage: vi.fn().mockResolvedValue(undefined),
    };

    const sandbox = {
        sandboxId: 'sandbox-1',
        commands: {
            run: vi.fn().mockResolvedValue({
                exitCode: 0,
                stdout: compactStdout,
                stderr: '',
            }),
        },
        files: { write: vi.fn().mockResolvedValue(undefined) },
    };

    const raw = new AppGenerateService({
        lightdashConfig: {
            appRuntime: {
                dataAppCodingAgent: 'claude',
                otel: { enabled: false },
            },
            ai: { copilot: { providers: {} } },
        } as never,
        analytics: { track } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {
            findInOrganization: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });

    const service = raw as unknown as Record<string, unknown> & {
        runPipelineStages: (...args: unknown[]) => Promise<void>;
    };
    // Everything the compact stage sits between, stubbed to the shape the
    // pipeline expects. The compaction call itself is left real.
    service.assembleEffectiveSkill = vi.fn().mockResolvedValue(undefined);
    service.writeCatalogAndPrompt = vi.fn().mockResolvedValue({
        durationMs: 1,
        tableCount: 1,
        dimensionCount: 1,
        metricCount: 1,
        yamlBytes: 1,
    });
    service.runCodingAgentGeneration = vi.fn().mockResolvedValue({
        durationMs: 1,
        responseText: 'done',
        structuredOutput: null,
        toolCallCount: 0,
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheCreation1hInputTokens: 0,
            cacheCreation5mInputTokens: 0,
            numTurns: 1,
            durationApiMs: 1,
            costUsd: 0,
        },
        timeToFirstTokenMs: 1,
        turnDurationsMs: [1],
        generationAttemptCount: 1,
    });
    service.runBuildWithAutoFix = vi.fn().mockResolvedValue({
        buildMs: 1,
        fixAttempts: 0,
        fixGenerationMs: 0,
        fixUsage: null,
    });
    service.packageArtifacts = vi.fn().mockResolvedValue({
        distTar: Buffer.from('dist'),
        sourceTar: Buffer.from('src'),
        durationMs: 1,
    });
    service.uploadToS3 = vi.fn().mockResolvedValue(1);

    const runStages = (currentStatus: string = 'pending') =>
        service.runPipelineStages(
            sandbox,
            makePayload(),
            {},
            'bucket',
            {},
            performance.now(),
            currentStatus,
            true,
            { ANTHROPIC_API_KEY: 'key' },
            {
                defaultProvider: 'anthropic',
                providers: { anthropic: { apiKey: 'key' } },
                promptCacheTtl: '1h',
                compactLongSessions: true,
            },
            undefined,
            undefined,
            null,
            0,
        );

    return { runStages, statuses, sandbox, appModel, track };
}

const COMPACT_FAILED = JSON.stringify({
    type: 'system',
    subtype: 'status',
    status: null,
    compact_result: 'failed',
    compact_error: 'Not enough messages to compact.',
});

const COMPACT_SUCCESS = [
    JSON.stringify({
        type: 'system',
        subtype: 'status',
        status: null,
        compact_result: 'success',
    }),
    JSON.stringify({
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        duration_api_ms: 40_000,
        total_cost_usd: 1.5,
        usage: {
            input_tokens: 10,
            output_tokens: 3_000,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 470_000,
        },
    }),
].join('\n');

describe('AppGenerateService compact stage', () => {
    it('still builds when the agent could not summarize its session', async () => {
        const { runStages, statuses } = buildService(COMPACT_FAILED);

        await runStages();

        expect(statuses).toContain('compact');
        expect(statuses.at(-1)).toBe('ready');
    });

    it('reports what the summary itself cost, apart from the generation', async () => {
        const { runStages, track } = buildService(COMPACT_SUCCESS);

        await runStages();

        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.version.completed',
                properties: expect.objectContaining({
                    compactionResult: 'success',
                    compactCacheCreationInputTokens: 470_000,
                    compactOutputTokens: 3_000,
                    compactCostUsd: 1.5,
                    cacheCreationInputTokens: 0,
                }),
            }),
        );
    });

    it('never summarizes twice when a retry resumes past the stage', async () => {
        const { runStages, statuses, appModel, track } = buildService(
            COMPACT_FAILED,
            [{ kind: 'stage', message: CODING_AGENT_COMPACTION_NARRATION }],
        );

        await runStages('generating');

        expect(statuses).not.toContain('compact');
        expect(
            appModel.findPreviousFinishedVersionInThread,
        ).not.toHaveBeenCalled();
        expect(statuses.at(-1)).toBe('ready');
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.version.completed',
                properties: expect.objectContaining({
                    compactionAttempted: true,
                    compactionResult: 'interrupted',
                }),
            }),
        );
    });
});
