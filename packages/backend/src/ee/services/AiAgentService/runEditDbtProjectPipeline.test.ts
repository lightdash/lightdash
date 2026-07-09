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
    const createRemediationEvent = vi.fn().mockResolvedValue(undefined);
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
    const slackClient = { addReaction };
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
