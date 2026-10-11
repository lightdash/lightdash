import { AiAccessRefusalReason, AiAccessRefusedError } from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const PAYLOAD = {
    appUuid: 'app-1',
    version: 1,
    projectUuid: 'proj-1',
    organizationUuid: 'org-1',
    userUuid: 'user-1',
    prompt: 'Build a revenue app',
    isIteration: false,
    aiAgentToolCall: { promptUuid: 'prompt-1', toolCallId: 'tool-call-1' },
};

const SLACK_PROMPT = {
    promptUuid: 'prompt-1',
    threadUuid: 'thread-1',
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
    createdByUserUuid: 'author-1',
    slackChannelId: 'C123',
    promptSlackTs: '111.222',
};

const buildService = (
    version: {
        status: string;
        error?: string | null;
        status_message?: string | null;
    },
    options?: {
        isSlack?: boolean;
        alreadyResolved?: boolean;
        captureError?: Error;
        slackImage?:
            | { source: 'slackFile'; fileId: string }
            | { source: 'url'; url: string }
            | null;
    },
) => {
    const updateToolResultIfPending = vi
        .fn()
        .mockResolvedValue(options?.alreadyResolved !== true);
    const hasToolResult = vi.fn().mockResolvedValue(true);
    const postMessage = vi.fn().mockResolvedValue(undefined);
    const exportDataApp = options?.captureError
        ? vi.fn().mockRejectedValue(options.captureError)
        : vi.fn().mockResolvedValue({
              imageBuffer: Buffer.from('png-bytes'),
              imageUrl: 'https://ld.example.com/api/v1/slack/preview/img-1',
          });
    const tryUploadingImageToSlack = vi.fn().mockResolvedValue(
        options?.slackImage === null
            ? undefined
            : (options?.slackImage ?? {
                  source: 'slackFile',
                  fileId: 'F123',
              }),
    );
    const loadRequest = vi.fn().mockResolvedValue({});
    const assertOperationWithRequest = vi.fn().mockResolvedValue(undefined);
    const service = new AiAgentService({
        agentPermissionService: { loadRequest, assertOperationWithRequest },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                ...defaultSessionUser,
                userUuid: 'user-1',
                organizationUuid: 'org-1',
            }),
        },
        lightdashConfig: { siteUrl: 'https://ld.example.com' },
        aiAgentModel: {
            updateToolResultIfPending,
            hasToolResult,
            findSlackPrompt: vi
                .fn()
                .mockResolvedValue(options?.isSlack ? SLACK_PROMPT : undefined),
            getAgentBySlackChannelId: vi.fn().mockResolvedValue({
                uuid: 'agent-1',
                name: 'Analytics Agent',
            }),
        },
        appModel: {
            findAppByUuid: vi.fn().mockResolvedValue({
                name: 'Revenue app',
                slug: 'revenue-app',
            }),
            getVersion: vi.fn().mockResolvedValue({
                error: null,
                status_message: null,
                ...version,
            }),
        },
        slackClient: { postMessage, tryUploadingImageToSlack },
        unfurlService: { exportDataApp },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return {
        service,
        loadRequest,
        assertOperationWithRequest,
        updateToolResultIfPending,
        postMessage,
        exportDataApp,
        tryUploadingImageToSlack,
    };
};

describe('AiAgentService.recordDataAppBuildOutcome', () => {
    it('does nothing for a build the AI agent did not start', async () => {
        const { service, updateToolResultIfPending } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome({
            ...PAYLOAD,
            aiAgentToolCall: undefined,
        });

        expect(updateToolResultIfPending).not.toHaveBeenCalled();
    });

    it('patches a ready build to success with the builder link', async () => {
        const { service, updateToolResultIfPending } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(updateToolResultIfPending).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: {
                    status: 'success',
                    appUuid: 'app-1',
                    version: 1,
                    name: 'Revenue app',
                    slug: 'revenue-app',
                    href: 'https://ld.example.com/projects/proj-1/apps/app-1',
                },
            }),
        );
    });

    it('announces a later version by number in the Slack thread', async () => {
        const { service, postMessage } = buildService(
            { status: 'ready' },
            { isSlack: true },
        );

        await service.recordDataAppBuildOutcome({ ...PAYLOAD, version: 2 });

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        text: expect.stringContaining(
                            'Version 2 of **Revenue app** is ready.',
                        ),
                    }),
                ]),
                text: expect.stringContaining(
                    'Version 2 of "Revenue app" is ready',
                ),
            }),
        );
    });

    it('leaves the result pending while the version is still building', async () => {
        const { service, updateToolResultIfPending } = buildService({
            status: 'building',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(updateToolResultIfPending).not.toHaveBeenCalled();
    });

    it('posts the builder link and a screenshot in one message when a Slack-originated build is ready', async () => {
        const {
            service,
            postMessage,
            exportDataApp,
            tryUploadingImageToSlack,
        } = buildService({ status: 'ready' }, { isSlack: true });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(exportDataApp).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'proj-1',
                appUuid: 'app-1',
                authUserUuid: 'author-1',
            }),
        );
        expect(tryUploadingImageToSlack).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org-1',
                imageBuffer: Buffer.from('png-bytes'),
                imageUrl: 'https://ld.example.com/api/v1/slack/preview/img-1',
            }),
        );
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org-1',
                channel: 'C123',
                thread_ts: '111.222',
                username: 'Analytics Agent',
                blocks: [
                    expect.objectContaining({
                        text: expect.stringContaining(
                            '[Open it in the builder](https://ld.example.com/projects/proj-1/apps/app-1)',
                        ),
                    }),
                    expect.objectContaining({
                        type: 'image',
                        slack_file: { id: 'F123' },
                    }),
                ],
                text: expect.stringContaining('Revenue app'),
            }),
        );
    });

    it('falls back to the hosted image URL when the Slack file upload falls back', async () => {
        const { service, postMessage } = buildService(
            { status: 'ready' },
            {
                isSlack: true,
                slackImage: {
                    source: 'url',
                    url: 'https://ld.example.com/api/v1/slack/preview/img-1',
                },
            },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'image',
                        image_url:
                            'https://ld.example.com/api/v1/slack/preview/img-1',
                    }),
                ]),
            }),
        );
    });

    it('posts the text-only outcome when screenshot capture fails', async () => {
        const { service, postMessage } = buildService(
            { status: 'ready' },
            { isSlack: true, captureError: new Error('browser crashed') },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                blocks: [
                    expect.objectContaining({
                        text: expect.stringContaining(
                            '[Open it in the builder](https://ld.example.com/projects/proj-1/apps/app-1)',
                        ),
                    }),
                ],
            }),
        );
    });

    it('posts the text-only outcome when the image cannot reach Slack at all', async () => {
        const { service, postMessage } = buildService(
            { status: 'ready' },
            { isSlack: true, slackImage: null },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                blocks: [
                    expect.objectContaining({
                        text: expect.stringContaining('Open it in the builder'),
                    }),
                ],
            }),
        );
    });

    it('posts the failure message to the Slack thread when the build fails', async () => {
        const { service, postMessage, exportDataApp } = buildService(
            {
                status: 'error',
                error: 'sandbox exploded',
                status_message: 'The coding agent hit an error.',
            },
            { isSlack: true },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123',
                thread_ts: '111.222',
                blocks: [
                    expect.objectContaining({
                        text: expect.stringContaining(
                            'The coding agent hit an error.',
                        ),
                    }),
                ],
            }),
        );
        expect(exportDataApp).not.toHaveBeenCalled();
    });

    it('posts the cancelled message to the Slack thread when the build is cancelled', async () => {
        const { service, postMessage, exportDataApp } = buildService(
            { status: 'error', error: 'Cancelled by user' },
            { isSlack: true },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123',
                thread_ts: '111.222',
                blocks: [
                    expect.objectContaining({
                        text: expect.stringContaining(
                            'The build was cancelled.',
                        ),
                    }),
                ],
            }),
        );
        expect(exportDataApp).not.toHaveBeenCalled();
    });

    it('posts nothing to Slack for a web-originated build', async () => {
        const { service, postMessage, exportDataApp } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).not.toHaveBeenCalled();
        expect(exportDataApp).not.toHaveBeenCalled();
    });

    it('does not post again when the tool result was already resolved by a racing terminal writer', async () => {
        const { service, postMessage, exportDataApp } = buildService(
            { status: 'error', error: 'Build timed out.' },
            { isSlack: true, alreadyResolved: true },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).not.toHaveBeenCalled();
        expect(exportDataApp).not.toHaveBeenCalled();
    });
});

describe('recordDataAppBuildOutcome Slack work authority', () => {
    it.each(['absent', 'allowed', 'refused', 'malformed'] as const)(
        'handles %s markers only at delivery',
        async (state) => {
            const h = buildService({ status: 'ready' }, { isSlack: true });
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
            await h.service.recordDataAppBuildOutcome({
                ...PAYLOAD,
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
                { absent: 0, malformed: 0, refused: 1, allowed: 2 }[state],
            );
            expect(h.tryUploadingImageToSlack).toHaveBeenCalledTimes(
                state === 'absent' || state === 'allowed' ? 1 : 0,
            );
            expect(h.updateToolResultIfPending).toHaveBeenCalledTimes(1);
        },
    );
});

it('keeps an unmarked screenshot refusal on the existing text fallback path', async () => {
    const h = buildService(
        { status: 'ready' },
        {
            isSlack: true,
            captureError: new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_PROJECT_DENIED,
            ),
        },
    );
    await h.service.recordDataAppBuildOutcome(PAYLOAD);
    expect(h.postMessage).toHaveBeenCalledTimes(1);
    expect(h.tryUploadingImageToSlack).not.toHaveBeenCalled();
    expect(h.loadRequest).not.toHaveBeenCalled();
});

describe('app outcome delivery failure latch', () => {
    const marker = {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        projectUuid: 'proj-1',
    };
    it.each(['error', 'refusal'] as const)(
        'withholds both screenshot and text after one check %s',
        async (kind) => {
            const h = buildService({ status: 'ready' }, { isSlack: true });
            const error =
                kind === 'refusal'
                    ? new AiAccessRefusedError(
                          AiAccessRefusalReason.AGENT_PROJECT_DENIED,
                      )
                    : new Error('Database unavailable');
            h.loadRequest.mockRejectedValueOnce(error);
            await h.service.recordDataAppBuildOutcome({
                ...PAYLOAD,
                agentWork: marker,
            });
            expect(h.exportDataApp).toHaveBeenCalledTimes(1);
            expect(h.tryUploadingImageToSlack).not.toHaveBeenCalled();
            expect(h.postMessage).not.toHaveBeenCalled();
            expect(h.loadRequest).toHaveBeenCalledTimes(1);
        },
    );
    it.each([false, true])(
        'keeps text fallback for a capture error, marked: %s',
        async (marked) => {
            const h = buildService(
                { status: 'ready' },
                { isSlack: true, captureError: new Error('Capture failed') },
            );
            await h.service.recordDataAppBuildOutcome({
                ...PAYLOAD,
                ...(marked ? { agentWork: marker } : {}),
            });
            expect(h.tryUploadingImageToSlack).not.toHaveBeenCalled();
            expect(h.postMessage).toHaveBeenCalledTimes(1);
            expect(h.postMessage.mock.calls[0][0].blocks).toHaveLength(1);
            expect(h.loadRequest).toHaveBeenCalledTimes(marked ? 1 : 0);
        },
    );
    it('loads the person and policy twice for a marked screenshot outcome', async () => {
        const h = buildService({ status: 'ready' }, { isSlack: true });
        await h.service.recordDataAppBuildOutcome({
            ...PAYLOAD,
            agentWork: marker,
        });
        expect(
            h.service['userModel'].findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(2);
        expect(h.loadRequest).toHaveBeenCalledTimes(2);
        expect(h.tryUploadingImageToSlack).toHaveBeenCalledTimes(1);
        expect(h.postMessage).toHaveBeenCalledTimes(1);
    });
});
