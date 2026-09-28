import type { App } from '@slack/bolt';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

type ActionHandler = (args: {
    ack: () => Promise<void>;
    body: unknown;
    context: { teamId: string };
    respond: (message: unknown) => Promise<void>;
    client: { views: { open: (view: unknown) => Promise<void> } };
}) => Promise<void>;

const answerBlock = {
    type: 'section',
    text: { type: 'mrkdwn', text: 'The answer' },
};

const buildService = (format: 'legacy' | 'modern', score = -1) => {
    const aiAgentModel = {
        updateHumanScore: vi.fn().mockResolvedValue(undefined),
        findPromptContext: vi.fn().mockResolvedValue(null),
    };
    const slackAuthenticationModel = {
        getOrganizationUuidFromTeamId: vi.fn().mockResolvedValue('org-uuid'),
        getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({}),
    };
    const service = new AiAgentService({
        aiAgentModel,
        slackAuthenticationModel,
        openIdIdentityModel: {
            findIdentityByOpenId: vi.fn().mockResolvedValue(null),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: 'https://app.example.com', ai: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let handler: ActionHandler | undefined;
    const app = {
        action: vi.fn((_pattern: string, callback: ActionHandler) => {
            handler = callback;
        }),
    };
    if (format === 'legacy') {
        service.handlePromptDownvote(app as unknown as App);
    } else {
        service.handlePromptFeedbackButtons(app as unknown as App);
    }
    if (!handler) throw new Error('Feedback handler was not registered');

    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockResolvedValue(undefined);
    const args = {
        ack,
        respond,
        client: { views: { open } },
        context: { teamId: 'T12345' },
        body: {
            type: 'block_actions',
            trigger_id: 'trigger-id',
            user: { id: 'U12345' },
            actions: [
                format === 'legacy'
                    ? { type: 'button', value: 'prompt-uuid' }
                    : {
                          type: 'feedback_buttons',
                          selected_button: {
                              value: JSON.stringify({
                                  promptUuid: 'prompt-uuid',
                                  score,
                              }),
                          },
                      },
            ],
            message: {
                blocks: [
                    answerBlock,
                    { type: 'actions', block_id: 'prompt_human_score' },
                ],
            },
        },
    };
    return { handler, args, aiAgentModel, slackAuthenticationModel };
};

describe.each(['legacy', 'modern'] as const)('%s Slack downvote', (format) => {
    it('does not open feedback or record a vote when OAuth is required but missing', async () => {
        const { handler, args, aiAgentModel, slackAuthenticationModel } =
            buildService(format);
        slackAuthenticationModel.getInstallationFromOrganizationUuid.mockResolvedValueOnce(
            { aiRequireOAuth: true },
        );

        await handler(args);

        expect(args.client.views.open).not.toHaveBeenCalled();
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
        expect(args.respond).not.toHaveBeenCalled();
    });

    it('ignores an action without a prompt value', async () => {
        const { handler, args, aiAgentModel } = buildService(format);
        args.body.actions = [{ type: 'button', value: '' }];

        await handler(args);

        expect(args.client.views.open).not.toHaveBeenCalled();
        expect(aiAgentModel.updateHumanScore).not.toHaveBeenCalled();
        expect(args.respond).not.toHaveBeenCalled();
    });

    it('still records the vote and updates the message if Slack rejects the modal', async () => {
        const { handler, args, aiAgentModel } = buildService(format);
        args.client.views.open.mockRejectedValueOnce(
            new Error('expired_trigger_id'),
        );

        await expect(handler(args)).resolves.toBeUndefined();

        expect(aiAgentModel.updateHumanScore).toHaveBeenCalledWith(
            expect.objectContaining({
                promptUuid: 'prompt-uuid',
                humanScore: -1,
            }),
        );
        expect(args.respond).toHaveBeenCalledOnce();
    });

    it.each(['score', 'message'] as const)(
        'opens feedback without waiting for a slow %s update',
        async (slowOperation) => {
            const { handler, args, aiAgentModel } = buildService(format);
            let release: () => void = () => {};
            const pending = new Promise<void>((resolve) => {
                release = resolve;
            });
            const slowMock =
                slowOperation === 'score'
                    ? aiAgentModel.updateHumanScore
                    : args.respond;
            slowMock.mockReturnValueOnce(pending);

            const handling = handler(args);
            try {
                await vi.waitFor(() => expect(slowMock).toHaveBeenCalled());
                expect(args.ack).toHaveBeenCalledOnce();
                expect(args.client.views.open).toHaveBeenCalledWith({
                    trigger_id: 'trigger-id',
                    view: expect.objectContaining({
                        type: 'modal',
                        callback_id: 'downvote_feedback_modal',
                        private_metadata: JSON.stringify({
                            promptUuid: 'prompt-uuid',
                        }),
                    }),
                });
            } finally {
                release();
                await handling;
            }

            expect(aiAgentModel.updateHumanScore).toHaveBeenCalledWith(
                expect.objectContaining({
                    promptUuid: 'prompt-uuid',
                    humanScore: -1,
                    preserveHumanFeedback: true,
                }),
            );
            expect(args.respond).toHaveBeenCalledWith({
                replace_original: true,
                blocks: [
                    answerBlock,
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text:
                                    format === 'legacy'
                                        ? '<@U12345> downvoted this answer :thumbsdown:'
                                        : '<@U12345> marked this answer unhelpful :thumbsdown:',
                            },
                        ],
                    },
                ],
            });
        },
    );
});

it('records positive modern feedback without opening a downvote modal', async () => {
    const { handler, args, aiAgentModel } = buildService('modern', 1);

    await handler(args);

    expect(args.client.views.open).not.toHaveBeenCalled();
    expect(aiAgentModel.updateHumanScore).toHaveBeenCalledWith({
        promptUuid: 'prompt-uuid',
        humanScore: 1,
        humanFeedback: undefined,
        preserveHumanFeedback: false,
    });
    expect(args.respond).toHaveBeenCalledWith(
        expect.objectContaining({
            blocks: [
                answerBlock,
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '<@U12345> marked this answer helpful :thumbsup:',
                        },
                    ],
                },
            ],
        }),
    );
});
