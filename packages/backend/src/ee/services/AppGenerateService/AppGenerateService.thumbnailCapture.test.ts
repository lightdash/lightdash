import { type AppGeneratePipelineJobPayload } from '@lightdash/common';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const APP_UUID = 'app-uuid-1';
const THREAD_UUID = 'thread-uuid-1';
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

function buildService() {
    const statuses: string[] = [];
    // Every job the pipeline enqueues, by scheduler method name.
    const enqueuedJobs: string[] = [];
    const schedulerClient = new Proxy(
        {},
        {
            get: (_target, method) => async () => {
                enqueuedJobs.push(String(method));
                return { jobId: 'job-1' };
            },
        },
    );
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
            status_history: [],
        }),
        findThreadByUuid: vi.fn().mockResolvedValue({
            app_thread_uuid: THREAD_UUID,
            app_id: APP_UUID,
            thread_number: 1,
            coding_agent_session_id: null,
            coding_agent_session_usage: null,
        }),
        threadHasVersionThatReachedCodingAgent: vi
            .fn()
            .mockResolvedValue(false),
        hasCancelledVersionSinceLastReady: vi.fn().mockResolvedValue(false),
        findPreviousFinishedVersionInThread: vi.fn().mockResolvedValue(null),
        updateVersionStatusIfInProgress: vi
            .fn()
            .mockImplementation(async (_app: string, _v: number, status) => {
                statuses.push(status);
                return true;
            }),
        getVersionStatus: vi.fn().mockResolvedValue('generating'),
        recordVersionGenerationUsage: vi.fn().mockResolvedValue(undefined),
        setThreadCodingAgentSessionUsage: vi.fn().mockResolvedValue(undefined),
        recordBuildNarration: vi.fn().mockResolvedValue(undefined),
        updateStatusMessage: vi.fn().mockResolvedValue(undefined),
    };

    const sandbox = {
        sandboxId: 'sandbox-1',
        commands: {
            run: vi.fn().mockResolvedValue({
                exitCode: 0,
                stdout: '',
                stderr: '',
            }),
        },
        files: { write: vi.fn().mockResolvedValue(undefined) },
    };

    const raw = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
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
        organizationSettingsModel: {} as never,
        organizationDesignModel: {
            findInOrganization: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        documentService: {} as never,
        composerChartService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock(),
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });

    const service = raw as unknown as Record<string, unknown> & {
        runPipelineStages: (...args: unknown[]) => Promise<void>;
    };
    // Every stage before the ready transition, stubbed to the shape the
    // pipeline expects.
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

    return { runStages, statuses, enqueuedJobs };
}

describe('AppGenerateService thumbnails after a build', () => {
    it('queues no thumbnail capture once the build is ready', async () => {
        const { runStages, statuses, enqueuedJobs } = buildService();

        await runStages();

        expect(statuses.at(-1)).toBe('ready');
        expect(statuses).not.toContain('error');
        expect(enqueuedJobs).toEqual([]);
    });
});
