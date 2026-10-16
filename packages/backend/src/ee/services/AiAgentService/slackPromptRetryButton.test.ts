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

const PROMPT_UUID = 'prompt-uuid';
const SLACK_USER_ID = 'U12345';

type ActionHandler = (args: {
    ack: () => Promise<void>;
    body: unknown;
    action: unknown;
    respond: (message: unknown) => Promise<void>;
}) => Promise<void>;

const buildService = ({
    slackPrompt = {
        promptUuid: PROMPT_UUID,
        threadUuid: 'thread-uuid',
        agentUuid: 'agent-uuid',
        createdByUserUuid: 'user-uuid',
        projectUuid: 'project-uuid',
        organizationUuid: 'org-uuid',
        slackUserId: SLACK_USER_ID,
    } as object | null,
    threadPromptUuids = [PROMPT_UUID],
    claimed = true,
}: {
    slackPrompt?: object | null;
    threadPromptUuids?: string[];
    claimed?: boolean;
} = {}) => {
    const aiAgentModel = {
        findSlackPrompt: vi.fn().mockResolvedValue(slackPrompt ?? undefined),
        getThreadMessages: vi
            .fn()
            .mockResolvedValue(
                threadPromptUuids.map((uuid) => ({ ai_prompt_uuid: uuid })),
            ),
        resetFailedPromptForRetry: vi.fn().mockResolvedValue(claimed),
        deleteAiPromptInterrupt: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        slackAiPrompt: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiAgentService({
        aiAgentModel,
        schedulerClient,
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: 'https://app.example.com' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    let handler: ActionHandler | undefined;
    const app = {
        action: vi.fn((_id: string, h: ActionHandler) => {
            handler = h;
        }),
    };
    service.handleSlackPromptRetryButton(app as unknown as App);
    if (!handler) throw new Error('Retry handler was not registered');

    return { handler, aiAgentModel, schedulerClient };
};

const click = async (handler: ActionHandler, slackUserId = SLACK_USER_ID) => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const respond = vi.fn().mockResolvedValue(undefined);
    await handler({
        ack,
        respond,
        body: {
            type: 'block_actions',
            api_app_id: 'A123',
            user: { id: slackUserId },
        },
        action: {
            type: 'button',
            action_id: 'ai_prompt_retry',
            value: PROMPT_UUID,
        },
    });
    return { ack, respond };
};

describe('AiAgentService.handleSlackPromptRetryButton', () => {
    it('resets the failed prompt and re-enqueues the Slack reply', async () => {
        const { handler, aiAgentModel, schedulerClient } = buildService();

        const { ack, respond } = await click(handler);

        expect(ack).toHaveBeenCalled();
        expect(aiAgentModel.resetFailedPromptForRetry).toHaveBeenCalledWith(
            PROMPT_UUID,
        );
        expect(aiAgentModel.deleteAiPromptInterrupt).toHaveBeenCalledWith(
            PROMPT_UUID,
        );
        expect(schedulerClient.slackAiPrompt).toHaveBeenCalledWith({
            slackAppId: 'A123',
            slackPromptUuid: PROMPT_UUID,
            userUuid: 'user-uuid',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
        });
        expect(respond).not.toHaveBeenCalled();
    });

    it('refuses a retry from a different Slack user', async () => {
        const { handler, aiAgentModel, schedulerClient } = buildService();

        const { respond } = await click(handler, 'U-OTHER');

        expect(aiAgentModel.resetFailedPromptForRetry).not.toHaveBeenCalled();
        expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ response_type: 'ephemeral' }),
        );
    });

    it('refuses to retry a prompt that is not the latest in the thread', async () => {
        const { handler, aiAgentModel, schedulerClient } = buildService({
            threadPromptUuids: [PROMPT_UUID, 'newer-prompt'],
        });

        await click(handler);

        expect(aiAgentModel.resetFailedPromptForRetry).not.toHaveBeenCalled();
        expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
    });

    it('does not re-enqueue when the prompt is already retrying or answered', async () => {
        const { handler, schedulerClient } = buildService({ claimed: false });

        const { respond } = await click(handler);

        expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith(
            expect.objectContaining({ response_type: 'ephemeral' }),
        );
    });

    it('replies when the prompt no longer exists', async () => {
        const { handler, schedulerClient } = buildService({
            slackPrompt: null,
        });

        const { respond } = await click(handler);

        expect(schedulerClient.slackAiPrompt).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalled();
    });
});
