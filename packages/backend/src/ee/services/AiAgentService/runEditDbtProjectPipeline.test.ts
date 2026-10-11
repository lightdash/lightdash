import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    InsufficientGitPermissionsError,
    InvalidUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import * as utils from '../../../utils';
import {
    WritebackAgentAccessError,
    WritebackThreadPrClosedError,
} from '../AiWritebackService/errors';
import { AiAgentService } from './AiAgentService';

vi.mock('../../../utils', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../utils')>();
    return {
        ...original,
        wrapSentryTransaction: vi.fn(original.wrapSentryTransaction),
    };
});

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    captureException: vi.fn(),
}));

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
    const setPromptNeedsUserInput = vi.fn().mockResolvedValue(true);
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
        setPromptNeedsUserInput,
        hasToolResult,
        getToolResultsForPrompt: vi
            .fn()
            .mockResolvedValue([editDbtProjectToolResult]),
        getAgentBySlackChannelId: vi
            .fn()
            .mockResolvedValue({ uuid: 'agent-1', name: 'Analytics Agent' }),
    };
    const userModel = {
        findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
            ...defaultSessionUser,
            userUuid: 'user-1',
            organizationUuid: 'org-1',
        }),
    };
    const aiWritebackService = {
        markRunError: vi.fn().mockResolvedValue(true),
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

    const loadRequest = vi.fn().mockResolvedValue({});
    const assertOperationWithRequest = vi.fn().mockResolvedValue(undefined);
    const service = new AiAgentService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        agentPermissionService: { loadRequest, assertOperationWithRequest },
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
        userModel,
        aiWritebackService,
        featureFlagService,
        loadRequest,
        assertOperationWithRequest,
        updateToolResult,
        updateModelResponse,
        setPromptNeedsUserInput,
        addReaction,
        postMessage,
        hasToolResult,
        createRemediationEvent,
        createPreviewForPullRequest,
        previewDeploySetupService,
    };
};

describe('AiAgentService.runEditDbtProjectPipeline', () => {
    it.each([false, true])(
        'unmarked full PR delivery keeps baseline reads and calls (Slack=%s)',
        async (isSlack) => {
            const h = buildService({
                isSlack,
                previewUrl: 'https://app.example/preview',
            });
            await h.service.runEditDbtProjectPipeline({
                ...PAYLOAD,
                isSlackPrompt: isSlack,
            });
            expect(
                h.userModel.findSessionUserAndOrgByUuid,
            ).toHaveBeenCalledTimes(1);
            expect(h.featureFlagService.get).toHaveBeenCalledTimes(1);
            expect(h.loadRequest).not.toHaveBeenCalled();
            expect(h.assertOperationWithRequest).not.toHaveBeenCalled();
            expect(h.aiWritebackService.run).toHaveBeenCalledTimes(1);
            expect(h.createPreviewForPullRequest).toHaveBeenCalledTimes(1);
            expect(h.updateToolResult).toHaveBeenCalledTimes(1);
            expect(h.addReaction).toHaveBeenCalledTimes(isSlack ? 1 : 0);
            expect(h.postMessage).toHaveBeenCalledTimes(isSlack ? 1 : 0);
        },
    );

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

    it('keeps the selected additional dbt source through the worker pipeline', async () => {
        const primaryResult = {
            ...WRITEBACK_RESULT,
            repository: 'acme/primary-analytics',
            output: 'Updated models/orders.yml with primary orders.',
            dbtSourceUuid: '00000000-0000-0000-0000-000000000001',
        };
        const additionalResult = {
            ...WRITEBACK_RESULT,
            repository: 'acme/additional-analytics',
            output: 'Updated models/orders.yml with additional orders.',
            dbtSourceUuid: '00000000-0000-0000-0000-000000000002',
        };
        const run = vi
            .fn()
            .mockImplementation(async (args) =>
                args.dbtSourceUuid === additionalResult.dbtSourceUuid
                    ? additionalResult
                    : primaryResult,
            );
        const { service, updateToolResult } = buildService({ run });

        await service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            dbtSourceUuid: additionalResult.dbtSourceUuid,
        });

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                result: expect.stringContaining('acme/additional-analytics'),
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

    it('does not offer or create preview deployment for a Bitbucket pull request', async () => {
        const {
            service,
            updateToolResult,
            createPreviewForPullRequest,
            previewDeploySetupService,
        } = buildService({
            previewDeploySetupEnabled: true,
            ciStatus: { hasPreviewDeployWorkflow: false },
            run: vi.fn().mockResolvedValue({
                ...WRITEBACK_RESULT,
                prUrl: 'https://bitbucket.org/workspace/dbt/pull-requests/7',
            }),
        });
        await service.runEditDbtProjectPipeline(PAYLOAD);
        expect(createPreviewForPullRequest).not.toHaveBeenCalled();
        expect(
            previewDeploySetupService.getOrScanProjectCiStatus,
        ).not.toHaveBeenCalled();
        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'success',
                    previewUrl: null,
                }),
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
        const {
            service,
            updateToolResult,
            updateModelResponse,
            setPromptNeedsUserInput,
        } = buildService({ run, getRunStatus: getRunStatusMock('error') });

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
        expect(setPromptNeedsUserInput).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            needsUserInput: true,
            metadata: {
                gate: 'structured',
                reason: 'writeback_source_selection',
            },
        });
    });

    it('posts the dbt source selection question to Slack', async () => {
        const run = vi.fn().mockResolvedValue({
            ...WRITEBACK_RESULT,
            prUrl: null,
            prAction: null,
            needsDbtSourceSelection: true,
            dbtSourceOptions: [
                { name: 'jaffle-2', repository: null, isPrimary: false },
            ],
        });
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
                text: expect.stringContaining('jaffle-2'),
                blocks: expect.arrayContaining([expect.anything()]),
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

describe('runEditDbtProjectPipeline Slack work authority', () => {
    it.each(['absent', 'allowed', 'refused', 'malformed'] as const)(
        'checks %s markers at start and delivery',
        async (state) => {
            const h = buildService({ isSlack: true });
            if (state === 'refused')
                h.assertOperationWithRequest.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                    ),
                );
            const marker = {
                userUuid: 'user-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
            };
            await h.service.runEditDbtProjectPipeline({
                ...PAYLOAD,
                isSlackPrompt: true,
                ...(state === 'absent'
                    ? {}
                    : {
                          agentWork:
                              state === 'malformed'
                                  ? ({} as typeof marker)
                                  : marker,
                      }),
            });
            expect(h.postMessage).toHaveBeenCalledTimes(
                state === 'absent' || state === 'allowed' ? 1 : 0,
            );
            expect(h.loadRequest).toHaveBeenCalledTimes(
                { absent: 0, malformed: 0, allowed: 4, refused: 1 }[state],
            );
            expect(h.updateToolResult).toHaveBeenCalledTimes(1);
        },
    );
});

it.each(['error', 'refusal'] as const)(
    'withholds a later outcome in the same run after a check %s',
    async (kind) => {
        const h = buildService({
            isSlack: true,
            run: vi.fn().mockResolvedValue({
                ...WRITEBACK_RESULT,
                needsDbtSourceSelection: true,
            }),
        });
        const error =
            kind === 'refusal'
                ? new AiAccessRefusedError(
                      AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                  )
                : new Error('Database unavailable');
        h.loadRequest.mockRejectedValueOnce(error);
        await h.service.runEditDbtProjectPipeline({
            ...PAYLOAD,
            isSlackPrompt: true,
            agentWork: {
                userUuid: 'user-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
            },
        });
        expect(h.updateModelResponse).not.toHaveBeenCalled();
        expect(h.setPromptNeedsUserInput).not.toHaveBeenCalled();
        expect(h.loadRequest).toHaveBeenCalledTimes(1);
        expect(h.postMessage).not.toHaveBeenCalled();
    },
);

const markedPayload = {
    ...PAYLOAD,
    agentWork: {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        projectUuid: 'proj-1',
    },
};
const refusalText =
    'Agent access changed. This task stopped. Ask an admin to review agent access.';
const checkErrorText = 'The access check could not run. This task stopped.';

describe('dbt edit work authority', () => {
    it.each([
        'inactive',
        'removed',
        'policy',
        'capability',
        'malformed',
        'organization',
        'project',
        'check error',
    ] as const)(
        'settles run and card for %s before calling the engine',
        async (reason) => {
            const h = buildService({ isSlack: true });
            if (reason === 'inactive')
                h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                    ...defaultSessionUser,
                    isActive: false,
                });
            if (reason === 'removed')
                h.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
                    new InvalidUser('No membership'),
                );
            if (reason === 'policy')
                h.assertOperationWithRequest.mockRejectedValue(
                    new AiAccessRefusedError(
                        AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                    ),
                );
            if (reason === 'capability')
                h.assertOperationWithRequest.mockImplementation(
                    async ({ operation }) => {
                        if (operation.key === 'editDbtProject')
                            throw new AiAccessRefusedError(
                                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                            );
                    },
                );
            if (reason === 'check error')
                h.loadRequest.mockRejectedValue(new Error('db unavailable'));
            await h.service.runEditDbtProjectPipeline({
                ...markedPayload,
                isSlackPrompt: true,
                agentWork:
                    reason === 'malformed'
                        ? ({} as typeof markedPayload.agentWork)
                        : {
                              ...markedPayload.agentWork,
                              ...(reason === 'organization'
                                  ? { organizationUuid: 'other' }
                                  : {}),
                              ...(reason === 'project'
                                  ? { projectUuid: 'other' }
                                  : {}),
                          },
            });
            const message =
                reason === 'check error' ? checkErrorText : refusalText;
            expect(h.aiWritebackService.markRunError).toHaveBeenCalledWith(
                'run-1',
                message,
            );
            expect(h.updateToolResult).toHaveBeenCalledWith(
                'prompt-1',
                'tool-call-1',
                {
                    result: message,
                    metadata: { status: 'error', errorCode: 'unknown' },
                },
            );
            expect(h.aiWritebackService.run).not.toHaveBeenCalled();
            expect(h.createPreviewForPullRequest).not.toHaveBeenCalled();
            expect(h.addReaction).not.toHaveBeenCalled();
            expect(h.postMessage).not.toHaveBeenCalled();
        },
    );

    it.each([false, true])(
        'allows an inactive service account and uses the prompt surface (Slack=%s)',
        async (isSlack) => {
            const h = buildService({ isSlack });
            h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...defaultSessionUser,
                isActive: false,
            });
            h.userModel.findServiceAccountByUserUuid.mockResolvedValue({
                organizationUuid: 'org-1',
            });
            await h.service.runEditDbtProjectPipeline({
                ...markedPayload,
                isSlackPrompt: isSlack,
            });
            expect(h.aiWritebackService.run).toHaveBeenCalledTimes(1);
            expect(h.assertOperationWithRequest).toHaveBeenCalledWith({
                request: {},
                operation: expect.objectContaining({
                    kind: 'agent_tool',
                    key: 'editDbtProject',
                    surface: isSlack
                        ? AgentActorSurface.SLACK_AGENT
                        : AgentActorSurface.IN_APP_AGENT,
                }),
            });
        },
    );

    it.each(['preview', 'final result', 'review event', 'reaction'] as const)(
        'keeps a ready run and settles the card after a refusal before %s',
        async (step) => {
            const h = buildService({
                isSlack: true,
                reviewRemediation:
                    step === 'review event'
                        ? { uuid: 'review-1', organizationUuid: 'org-1' }
                        : null,
            });
            const failAt = {
                'review event': 2,
                reaction: 2,
                preview: 3,
                'final result': 3,
            }[step];
            let checks = 0;
            h.assertOperationWithRequest.mockImplementation(async () => {
                checks += 1;
                if (checks === failAt)
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                    );
            });
            if (step === 'preview')
                h.createPreviewForPullRequest.mockImplementation(
                    async ({ assertPublishAllowed }) => {
                        await assertPublishAllowed();
                        return null;
                    },
                );
            h.aiWritebackService.markRunError.mockResolvedValue(false);
            await h.service.runEditDbtProjectPipeline({
                ...markedPayload,
                isSlackPrompt: true,
            });
            expect(h.updateToolResult).toHaveBeenLastCalledWith(
                'prompt-1',
                'tool-call-1',
                {
                    result: refusalText,
                    metadata: { status: 'error', errorCode: 'unknown' },
                },
            );
            expect(h.aiWritebackService.markRunError).toHaveBeenCalledWith(
                'run-1',
                refusalText,
            );
            expect(h.loadRequest).toHaveBeenCalledTimes(failAt);
            expect(h.postMessage).not.toHaveBeenCalled();
            if (step === 'review event')
                expect(h.createRemediationEvent).not.toHaveBeenCalled();
            if (step === 'reaction')
                expect(h.addReaction).not.toHaveBeenCalled();
        },
    );

    it('makes nine checks for GitHub, a preview, its comment, the tool result and Slack outcome', async () => {
        const h = buildService({ isSlack: true });
        h.aiWritebackService.run.mockImplementation(
            async (_args, assertPublishAllowed) => {
                await assertPublishAllowed();
                await assertPublishAllowed();
                await assertPublishAllowed();
                return WRITEBACK_RESULT;
            },
        );
        h.createPreviewForPullRequest.mockImplementation(
            async ({ assertPublishAllowed }) => {
                await assertPublishAllowed();
                await assertPublishAllowed();
                return { previewUrl: 'https://example.com/preview' };
            },
        );
        await h.service.runEditDbtProjectPipeline({
            ...markedPayload,
            isSlackPrompt: true,
        });
        expect(h.loadRequest).toHaveBeenCalledTimes(9);
        expect(h.userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(
            10,
        );
        expect(h.postMessage).toHaveBeenCalledTimes(1);
    });

    it.each([2, 3, 4, 5])(
        'stops source selection at check %s and preserves an already written card',
        async (failAt) => {
            const h = buildService({
                isSlack: true,
                run: vi.fn().mockResolvedValue({
                    ...WRITEBACK_RESULT,
                    prUrl: null,
                    needsDbtSourceSelection: true,
                    dbtSourceOptions: [],
                }),
            });
            let checks = 0;
            h.loadRequest.mockImplementation(async () => {
                checks += 1;
                if (checks === failAt) throw new Error('db unavailable');
                return {};
            });
            await h.service.runEditDbtProjectPipeline({
                ...markedPayload,
                isSlackPrompt: true,
            });
            expect(h.updateToolResult).toHaveBeenCalledTimes(1);
            expect(h.updateToolResult).toHaveBeenCalledWith(
                'prompt-1',
                'tool-call-1',
                failAt === 2
                    ? {
                          result: checkErrorText,
                          metadata: { status: 'error', errorCode: 'unknown' },
                      }
                    : expect.objectContaining({
                          metadata: expect.objectContaining({
                              status: 'success',
                              needsDbtSourceSelection: true,
                          }),
                      }),
            );
            expect(h.aiWritebackService.markRunError).toHaveBeenCalledTimes(
                failAt === 2 ? 1 : 0,
            );
            expect(h.updateModelResponse).toHaveBeenCalledTimes(
                failAt > 3 ? 1 : 0,
            );
            expect(h.setPromptNeedsUserInput).toHaveBeenCalledTimes(
                failAt > 4 ? 1 : 0,
            );
            expect(h.postMessage).not.toHaveBeenCalled();
            expect(h.loadRequest).toHaveBeenCalledTimes(failAt);
        },
    );
});

it.each(['refusal', 'check error'] as const)(
    'preserves the real error card and run when the Slack error check fails (%s)',
    async (kind) => {
        const capture = vi.mocked(Sentry.captureException);
        capture.mockClear();
        const runRow = {
            status: 'error',
            prUrl: null,
            errorMessage: 'engine failed',
        };
        const h = buildService({
            isSlack: true,
            run: vi.fn().mockRejectedValue(new Error('engine failed')),
            getRunStatus: vi.fn().mockResolvedValue(runRow),
        });
        const failure =
            kind === 'refusal'
                ? new AiAccessRefusedError(
                      AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                  )
                : new Error('check failed');
        h.loadRequest.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);
        await h.service.runEditDbtProjectPipeline({
            ...markedPayload,
            isSlackPrompt: true,
        });
        expect(h.updateToolResult).toHaveBeenLastCalledWith(
            'prompt-1',
            'tool-call-1',
            {
                result: expect.stringContaining('engine failed'),
                metadata: { status: 'error', errorCode: 'unknown' },
            },
        );
        expect(h.updateToolResult).toHaveBeenCalledTimes(1);
        expect(h.aiWritebackService.markRunError).not.toHaveBeenCalled();
        expect(runRow).toEqual({
            status: 'error',
            prUrl: null,
            errorMessage: 'engine failed',
        });
        expect(h.postMessage).not.toHaveBeenCalled();
        expect(
            capture.mock.calls.filter(([error]) => error === failure),
        ).toHaveLength(kind === 'refusal' ? 0 : 1);
    },
);

it.each(['refusal', 'check error'] as const)(
    'settles a %s in the original person load after the helper passes',
    async (kind) => {
        const h = buildService({});
        h.userModel.findSessionUserAndOrgByUuid
            .mockResolvedValueOnce({
                ...defaultSessionUser,
                userUuid: 'user-1',
                organizationUuid: 'org-1',
            })
            .mockRejectedValueOnce(
                kind === 'refusal'
                    ? new InvalidUser('No membership')
                    : new Error('database unavailable'),
            );
        await h.service.runEditDbtProjectPipeline(markedPayload);
        expect(h.updateToolResult).toHaveBeenLastCalledWith(
            'prompt-1',
            'tool-call-1',
            {
                result: kind === 'refusal' ? refusalText : checkErrorText,
                metadata: { status: 'error', errorCode: 'unknown' },
            },
        );
        expect(h.aiWritebackService.run).not.toHaveBeenCalled();
    },
);

it.each(['refusal', 'check error'] as const)(
    'reports only unexpected start checks to Sentry (%s)',
    async (kind) => {
        const wrapper = vi.mocked(utils.wrapSentryTransaction);
        wrapper.mockClear();
        const capture = vi.mocked(Sentry.captureException);
        capture.mockClear();
        const h = buildService({});
        const error =
            kind === 'refusal'
                ? new AiAccessRefusedError(
                      AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                  )
                : new Error('check unavailable');
        h.loadRequest.mockRejectedValue(error);
        await h.service.runEditDbtProjectPipeline(markedPayload);
        expect(wrapper).not.toHaveBeenCalled();
        if (kind === 'refusal') expect(capture).not.toHaveBeenCalled();
        else expect(capture).toHaveBeenCalledExactlyOnceWith(error);
        capture.mockClear();
    },
);

it('runs a marked dbt edit inside the Sentry transaction', async () => {
    const wrapper = vi.mocked(utils.wrapSentryTransaction);
    wrapper.mockClear();
    const h = buildService({});
    h.aiWritebackService.run.mockImplementation(async () => {
        expect(wrapper).toHaveBeenCalledExactlyOnceWith(
            'AiAgent.editDbtProject',
            {},
            expect.any(Function),
        );
        return WRITEBACK_RESULT;
    });
    await h.service.runEditDbtProjectPipeline(markedPayload);
    expect(h.aiWritebackService.run).toHaveBeenCalledTimes(1);
});

it('captures a mid-engine refusal once through the Sentry wrapper', async () => {
    const enabled = vi.spyOn(Sentry, 'isEnabled').mockReturnValue(true);
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    const h = buildService({});
    h.loadRequest
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(
            new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            ),
        );
    h.aiWritebackService.run.mockImplementation(
        async (_args, assertPublishAllowed) => {
            await assertPublishAllowed();
            return WRITEBACK_RESULT;
        },
    );
    try {
        await h.service.runEditDbtProjectPipeline(markedPayload);
        expect(capture).toHaveBeenCalledExactlyOnceWith(
            expect.any(WritebackAgentAccessError),
        );
    } finally {
        enabled.mockRestore();
    }
});

it.each(['refusal', 'check error'] as const)(
    'preserves a ready PR card and run when the Slack success check fails (%s)',
    async (kind) => {
        const capture = vi.mocked(Sentry.captureException);
        capture.mockClear();
        const runRow = {
            status: 'ready',
            prUrl: WRITEBACK_RESULT.prUrl,
            errorMessage: null,
        };
        const h = buildService({
            isSlack: true,
            getRunStatus: vi.fn().mockResolvedValue(runRow),
        });
        const failure =
            kind === 'refusal'
                ? new AiAccessRefusedError(
                      AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                  )
                : new Error('check unavailable');
        h.loadRequest
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(failure);
        await h.service.runEditDbtProjectPipeline({
            ...markedPayload,
            isSlackPrompt: true,
        });
        expect(h.updateToolResult).toHaveBeenCalledExactlyOnceWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    status: 'success',
                    prUrl: WRITEBACK_RESULT.prUrl,
                }),
            }),
        );
        expect(h.aiWritebackService.markRunError).not.toHaveBeenCalled();
        expect(runRow).toEqual({
            status: 'ready',
            prUrl: WRITEBACK_RESULT.prUrl,
            errorMessage: null,
        });
        expect(h.postMessage).not.toHaveBeenCalled();
        expect(h.loadRequest).toHaveBeenCalledTimes(4);
        if (kind === 'refusal') expect(capture).not.toHaveBeenCalled();
        else expect(capture).toHaveBeenCalledExactlyOnceWith(failure);
    },
);

it('preserves the source-selection card when the response check refuses', async () => {
    const h = buildService({
        isSlack: true,
        run: vi.fn().mockResolvedValue({
            ...WRITEBACK_RESULT,
            prUrl: null,
            needsDbtSourceSelection: true,
            dbtSourceOptions: [],
        }),
    });
    h.loadRequest
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(
            new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            ),
        );
    await h.service.runEditDbtProjectPipeline({
        ...markedPayload,
        isSlackPrompt: true,
    });
    expect(h.updateToolResult).toHaveBeenCalledExactlyOnceWith(
        'prompt-1',
        'tool-call-1',
        expect.objectContaining({
            metadata: expect.objectContaining({
                status: 'success',
                needsDbtSourceSelection: true,
            }),
        }),
    );
    expect(h.aiWritebackService.markRunError).not.toHaveBeenCalled();
    expect(h.updateModelResponse).not.toHaveBeenCalled();
    expect(h.setPromptNeedsUserInput).not.toHaveBeenCalled();
    expect(h.postMessage).not.toHaveBeenCalled();
    expect(h.loadRequest).toHaveBeenCalledTimes(3);
});

it('settles the tool card when the run status write fails after a start refusal', async () => {
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    const h = buildService({});
    h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
        ...defaultSessionUser,
        isActive: false,
    });
    const writeError = new Error('run write failed');
    h.aiWritebackService.markRunError.mockRejectedValue(writeError);
    await h.service.runEditDbtProjectPipeline(markedPayload);
    expect(h.updateToolResult).toHaveBeenCalledWith('prompt-1', 'tool-call-1', {
        result: refusalText,
        metadata: { status: 'error', errorCode: 'unknown' },
    });
    expect(capture).toHaveBeenCalledExactlyOnceWith(writeError);
    expect(h.aiWritebackService.run).not.toHaveBeenCalled();
});

it('does not report a mid-engine check error a second time from the job', async () => {
    const enabled = vi.spyOn(Sentry, 'isEnabled').mockReturnValue(true);
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    const h = buildService({});
    const checkError = new Error('db unavailable');
    h.loadRequest.mockResolvedValueOnce({}).mockRejectedValueOnce(checkError);
    h.aiWritebackService.run.mockImplementation(
        async (_args, assertPublishAllowed) => {
            await assertPublishAllowed();
            return WRITEBACK_RESULT;
        },
    );
    try {
        await h.service.runEditDbtProjectPipeline(markedPayload);
        expect(capture).toHaveBeenCalledExactlyOnceWith(
            expect.any(WritebackAgentAccessError),
        );
        expect(capture).not.toHaveBeenCalledWith(checkError);
        expect(h.updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            {
                result: checkErrorText,
                metadata: { status: 'error', errorCode: 'unknown' },
            },
        );
    } finally {
        enabled.mockRestore();
    }
});
