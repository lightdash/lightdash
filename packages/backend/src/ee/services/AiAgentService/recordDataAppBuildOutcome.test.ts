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
        headlessBrowser?: boolean;
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
    const unfurlImage = options?.captureError
        ? vi.fn().mockRejectedValue(options.captureError)
        : vi.fn().mockResolvedValue({
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
    const service = new AiAgentService({
        lightdashConfig: {
            siteUrl: 'https://ld.example.com',
            headlessBrowser:
                options?.headlessBrowser === false
                    ? { internalLightdashHost: 'http://internal.example.com' }
                    : {
                          host: 'headless-chrome',
                          internalLightdashHost: 'http://internal.example.com',
                      },
        },
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
            findAppByUuid: vi.fn().mockResolvedValue({ name: 'Revenue app' }),
            getVersion: vi.fn().mockResolvedValue({
                error: null,
                status_message: null,
                ...version,
            }),
        },
        slackClient: { postMessage, tryUploadingImageToSlack },
        unfurlService: { unfurlImage },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return {
        service,
        updateToolResultIfPending,
        postMessage,
        unfurlImage,
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
                    href: 'https://ld.example.com/projects/proj-1/apps/app-1',
                },
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
        const { service, postMessage, unfurlImage, tryUploadingImageToSlack } =
            buildService({ status: 'ready' }, { isSlack: true });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(unfurlImage).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'http://internal.example.com/minimal/projects/proj-1/apps/app-1',
                authUserUuid: 'author-1',
            }),
        );
        expect(tryUploadingImageToSlack).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org-1',
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

    it('skips the screenshot when no headless browser is configured', async () => {
        const { service, postMessage, unfurlImage } = buildService(
            { status: 'ready' },
            { isSlack: true, headlessBrowser: false },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(unfurlImage).not.toHaveBeenCalled();
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
        const { service, postMessage, unfurlImage } = buildService(
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
        expect(unfurlImage).not.toHaveBeenCalled();
    });

    it('posts the cancelled message to the Slack thread when the build is cancelled', async () => {
        const { service, postMessage, unfurlImage } = buildService(
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
        expect(unfurlImage).not.toHaveBeenCalled();
    });

    it('posts nothing to Slack for a web-originated build', async () => {
        const { service, postMessage, unfurlImage } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).not.toHaveBeenCalled();
        expect(unfurlImage).not.toHaveBeenCalled();
    });

    it('does not post again when the tool result was already resolved by a racing terminal writer', async () => {
        const { service, postMessage, unfurlImage } = buildService(
            { status: 'error', error: 'Build timed out.' },
            { isSlack: true, alreadyResolved: true },
        );

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(postMessage).not.toHaveBeenCalled();
        expect(unfurlImage).not.toHaveBeenCalled();
    });
});
