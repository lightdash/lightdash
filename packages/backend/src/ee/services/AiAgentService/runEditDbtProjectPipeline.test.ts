import { InsufficientGitPermissionsError } from '@lightdash/common';
import { WritebackThreadPrClosedError } from '../AiWritebackService/errors';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const WRITEBACK_RESULT = {
    prUrl: 'https://github.com/acme/dbt/pull/7',
    prAction: 'opened' as const,
    commitSha: 'abc123',
    additions: 4,
    deletions: 4,
    output: 'Updated four descriptions.',
    projectName: 'Analytics',
    repository: 'acme/dbt',
    steps: [],
    dbtSourceUuid: null,
};

const getRunStatusMock = (status: 'ready' | 'error') =>
    vi.fn().mockResolvedValue({ status, prUrl: null, errorMessage: null });

const WEB_PROMPT = {
    promptUuid: 'prompt-1',
    threadUuid: 'thread-1',
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
};

const SLACK_PROMPT = {
    ...WEB_PROMPT,
    slackUserId: 'U123',
    slackChannelId: 'C123',
    promptSlackTs: '111.222',
};

const PAYLOAD = {
    aiWritebackRunUuid: 'run-1',
    aiThreadUuid: 'thread-1',
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
    userUuid: 'user-1',
    promptUuid: 'prompt-1',
    isSlackPrompt: false,
    toolCallId: 'tool-call-1',
    writebackPrompt: 'add a metric',
    source: 'web' as const,
    prUrl: null,
    startNewPullRequest: null,
};

const buildService = (overrides: {
    isSlack?: boolean;
    promptFound?: boolean;
    run?: ReturnType<typeof vi.fn>;
    getRunStatus?: ReturnType<typeof vi.fn>;
    reviewRemediation?: unknown;
    previewDeploySetupEnabled?: boolean;
    ciStatus?: { hasPreviewDeployWorkflow: boolean } | null;
    previewUrl?: string | null;
}) => {
    const prompt = {
        ...(overrides.isSlack ? SLACK_PROMPT : WEB_PROMPT),
        response: 'prior response',
    };
    const promptFound = overrides.promptFound ?? true;
    const updateToolResult = vi.fn().mockResolvedValue(undefined);
    const updateModelResponse = vi.fn().mockResolvedValue(undefined);
    const addReaction = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn().mockResolvedValue(undefined);
    const hasToolResult = vi.fn().mockResolvedValue(true);
    const createRemediationEvent = vi.fn().mockResolvedValue(undefined);
    // A final tool-result row shaped so getModernPullRequestCardBlocks renders
    // a PR card for it (the Slack success card the pipeline delivers on resolve).
    const editDbtProjectToolResult = {
        uuid: 'tr-1',
        toolType: 'built-in',
        toolName: 'editDbtProject',
        metadata: {
            status: 'success',
            prUrl: WRITEBACK_RESULT.prUrl,
            prAction: 'opened',
            commitSha: WRITEBACK_RESULT.commitSha,
            additions: WRITEBACK_RESULT.additions,
            deletions: WRITEBACK_RESULT.deletions,
            previewUrl: null,
        },
    };
    const createPreviewForPullRequest = vi
        .fn()
        .mockResolvedValue(
            overrides.previewUrl === undefined
                ? null
                : { previewUrl: overrides.previewUrl },
        );

    const aiAgentModel = {
        findSlackPrompt: vi
            .fn()
            .mockResolvedValue(
                overrides.isSlack && promptFound ? prompt : undefined,
            ),
        findWebAppPrompt: vi
            .fn()
            .mockResolvedValue(
                !overrides.isSlack && promptFound ? prompt : undefined,
            ),
        updateToolResult,
        updateModelResponse,
        hasToolResult,
        getToolResultsForPrompt: vi
            .fn()
            .mockResolvedValue([editDbtProjectToolResult]),
        getAgentBySlackChannelId: vi
            .fn()
            .mockResolvedValue({ uuid: 'agent-1', name: 'Analytics Agent' }),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
            userUuid: 'user-1',
            organizationUuid: 'org-1',
        }),
    };
    const aiWritebackService = {
        run: overrides.run ?? vi.fn().mockResolvedValue(WRITEBACK_RESULT),
        // Mirrors what persistRunReady/persistRunFailed actually write for a
        // normal (non-raced) resolution, so the stale-race guard doesn't
        // fire by default — tests exercising the guard override this.
        getRunStatus:
            overrides.getRunStatus ??
            vi.fn().mockResolvedValue({
                status: 'ready',
                prUrl: null,
                errorMessage: null,
            }),
    };
    const aiAgentReviewClassifierModel = {
        findReviewRemediationByWorkThread: vi
            .fn()
            .mockResolvedValue(overrides.reviewRemediation ?? null),
        createRemediationEvent,
    };
    const slackClient = { addReaction, postMessage };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({
            enabled: overrides.previewDeploySetupEnabled ?? false,
        }),
    };
    const previewDeploySetupService = {
        getOrScanProjectCiStatus: vi
            .fn()
            .mockResolvedValue(overrides.ciStatus ?? null),
    };
    const writebackPreviewService = { createPreviewForPullRequest };

    const service = new AiAgentService({
        userModel,
        aiAgentModel,
        aiWritebackService,
        aiAgentReviewClassifierModel,
        slackClient,
        featureFlagService,
        previewDeploySetupService,
        writebackPreviewService,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return {
        service,
        updateToolResult,
        updateModelResponse,
        addReaction,
        postMessage,
        hasToolResult,
        createRemediationEvent,
        createPreviewForPullRequest,
    };
};

describe('AiAgentService.runEditDbtProjectPipeline', () => {
    it('skips the run and does nothing when the prompt cannot be found', async () => {
        const { service, updateToolResult } = buildService({
            promptFound: false,
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).not.toHaveBeenCalled();
    });

    it('runs the writeback and writes a success result to the stored tool call', async () => {
        const { service, updateToolResult } = buildService({});

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'success',
                    prUrl: WRITEBACK_RESULT.prUrl,
                    prAction: 'opened',
                    commitSha: 'abc123',
                }),
            }),
        );
    });

    it('waits for the tool-result row to exist before updating it', async () => {
        const { service, hasToolResult, updateToolResult } = buildService({});

        await service.runEditDbtProjectPipeline(PAYLOAD);

        // The guard is checked (with the run's prompt + tool call) so a fast
        // pipeline can't updateToolResult before onStepFinish inserts the row.
        expect(hasToolResult).toHaveBeenCalledWith('prompt-1', 'tool-call-1');
        expect(updateToolResult).toHaveBeenCalled();
    });

    it('adds a Slack reaction only for a Slack-originated prompt', async () => {
        const { service, addReaction } = buildService({ isSlack: true });

        await service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            isSlackPrompt: true,
        });

        expect(addReaction).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123',
                timestamp: '111.222',
                name: 'white_check_mark',
            }),
        );
    });

    it('does not add a Slack reaction for a web prompt', async () => {
        const { service, addReaction } = buildService({});

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(addReaction).not.toHaveBeenCalled();
    });

    it('posts the PR card to the Slack thread once the pipeline resolves', async () => {
        const { service, postMessage } = buildService({ isSlack: true });

        await service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            isSlackPrompt: true,
        });

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123',
                thread_ts: '111.222',
                blocks: expect.arrayContaining([expect.anything()]),
            }),
        );
    });

    it('does not post a Slack message for a web prompt', async () => {
        const { service, postMessage } = buildService({});

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('posts the failure to the Slack thread when the run errors', async () => {
        const run = vi.fn().mockRejectedValue(new Error('sandbox exploded'));
        const { service, postMessage } = buildService({
            isSlack: true,
            run,
            getRunStatus: getRunStatusMock('error'),
        });

        await service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            isSlackPrompt: true,
        });

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123',
                thread_ts: '111.222',
            }),
        );
    });

    it('records a build-fix remediation event when the thread is a remediation work thread', async () => {
        const remediation = { uuid: 'rem-1', organizationUuid: 'org-1' };
        const { service, createRemediationEvent } = buildService({
            reviewRemediation: remediation,
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(createRemediationEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                remediationUuid: 'rem-1',
                event: expect.objectContaining({ eventType: 'pr_updated' }),
            }),
        );
    });

    it('skips preview creation for a remediation work thread', async () => {
        const remediation = { uuid: 'rem-1', organizationUuid: 'org-1' };
        const { service, createPreviewForPullRequest } = buildService({
            reviewRemediation: remediation,
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(createPreviewForPullRequest).not.toHaveBeenCalled();
    });

    it('skips preview creation when suppressWritebackPreview is set', async () => {
        const { service, createPreviewForPullRequest } = buildService({});

        await service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            suppressWritebackPreview: true,
        });

        expect(createPreviewForPullRequest).not.toHaveBeenCalled();
    });

    it('includes the preview URL in the stored result when one is created', async () => {
        const { service, updateToolResult } = buildService({
            previewUrl: 'https://preview.example.com',
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    previewUrl: 'https://preview.example.com',
                }),
            }),
        );
    });

    it('classifies a closed-PR error and does not rethrow', async () => {
        const run = vi
            .fn()
            .mockRejectedValue(new WritebackThreadPrClosedError('merged'));
        const { service, updateToolResult } = buildService({
            run,
            getRunStatus: getRunStatusMock('error'),
        });

        await expect(
            service.runEditDbtProjectPipeline(PAYLOAD),
        ).resolves.toBeUndefined();

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'error',
                    errorCode: 'pull_request_not_open',
                }),
            }),
        );
    });

    it('classifies an insufficient-permissions error', async () => {
        const run = vi
            .fn()
            .mockRejectedValue(new InsufficientGitPermissionsError());
        const { service, updateToolResult } = buildService({
            run,
            getRunStatus: getRunStatusMock('error'),
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'error',
                    errorCode: 'git_write_permission',
                }),
            }),
        );
    });

    it('classifies an unrecognised error as unknown', async () => {
        const run = vi.fn().mockRejectedValue(new Error('sandbox exploded'));
        const { service, updateToolResult } = buildService({
            run,
            getRunStatus: getRunStatusMock('error'),
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'error',
                    errorCode: 'unknown',
                }),
            }),
        );
    });

    it('writes the dbt-source-selection outcome even though the run row was marked error', async () => {
        const options = [
            { name: 'jaffle-2', repository: null, isPrimary: false },
        ];
        const run = vi.fn().mockResolvedValue({
            ...WRITEBACK_RESULT,
            prUrl: null,
            prAction: null,
            needsDbtSourceSelection: true,
            dbtSourceOptions: options,
        });
        const { service, updateToolResult, updateModelResponse } = buildService(
            { run, getRunStatus: getRunStatusMock('error') },
        );

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'success',
                    needsDbtSourceSelection: true,
                    dbtSourceOptions: options,
                }),
            }),
        );
        expect(updateModelResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                promptUuid: 'prompt-1',
                response: expect.stringContaining('jaffle-2'),
            }),
        );
    });

    it('skips a stale success once the run was already finalized as an error', async () => {
        const { service, updateToolResult } = buildService({
            getRunStatus: getRunStatusMock('error'),
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).not.toHaveBeenCalled();
    });

    it('skips a stale error once the run was already finalized as ready', async () => {
        const run = vi.fn().mockRejectedValue(new Error('sandbox exploded'));
        const { service, updateToolResult } = buildService({
            run,
            getRunStatus: getRunStatusMock('ready'),
        });

        await service.runEditDbtProjectPipeline(PAYLOAD);

        expect(updateToolResult).not.toHaveBeenCalled();
    });
});
