import { AiAgentService } from './AiAgentService';
import {
    V3_SLACK_DEFERRED_RUN_DELAY_MS,
    V3_SLACK_QUEUED_RUN_MAX_DELAY_MS,
    V3_SLACK_QUEUED_RUN_TIMEOUT_MS,
} from './slackQueuedRunBackoff';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

vi.mock('../ai/models', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ai/models')>()),
    getModel: () => ({
        model: { modelId: 'test-model' },
        callOptions: {},
        providerOptions: null,
    }),
}));

const PROMPT_UUID = 'prompt-uuid';
const CHANNEL_ID = 'C123';
const RESPONSE_TS = '1700000000.000200';

const buildService = ({
    startSlackRunState,
    waitedMs,
}: {
    startSlackRunState: 'blocked' | 'deferred';
    waitedMs: number;
}) => {
    const now = Date.now();
    const slackAiPrompt = vi.fn().mockResolvedValue({ jobId: 'job' });
    const cancelSlackRunPlaceholder = vi.fn().mockResolvedValue(true);
    const updateMessage = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn().mockResolvedValue(undefined);
    const service = new AiAgentService({
        aiAgentV3Model: {
            findSlackUserMessage: vi.fn().mockResolvedValue({
                uuid: PROMPT_UUID,
                threadUuid: 'thread-uuid',
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
                agentUuid: null,
                createdByUserUuid: 'user-uuid',
                text: 'how many orders?',
                createdAt: new Date(now - waitedMs),
                response: null,
                humanScore: null,
                modelConfig: null,
                responseSlackTs: RESPONSE_TS,
                slackUserId: 'U123',
                slackChannelId: CHANNEL_ID,
                promptSlackTs: '1700000000.000100',
                slackThreadTs: '1700000000.000100',
            }),
            startSlackRun: vi.fn().mockResolvedValue({
                assistantMessage: { uuid: 'assistant-uuid', threadSeq: 2 },
                state: startSlackRunState,
            }),
            cancelSlackRunPlaceholder,
        },
        aiAgentModel: {
            findThread: vi
                .fn()
                .mockResolvedValue({ uuid: 'thread-uuid', agentUuid: null }),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                userUuid: 'user-uuid',
                organizationUuid: 'org-uuid',
            }),
        },
        aiAgentThreadRepository: {
            getStorageVersion: vi.fn().mockResolvedValue(3),
        },
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn()
                .mockResolvedValue({ defaultProvider: 'openai' }),
        },
        schedulerClient: { slackAiPrompt },
        slackClient: { updateMessage, postMessage },
        lightdashConfig: {
            siteUrl: 'https://example.com',
            ai: { copilot: {} },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    Object.assign(service, {
        createAuditedAbility: () => ({ can: () => true }),
    });
    return {
        cancelSlackRunPlaceholder,
        now,
        postMessage,
        service,
        slackAiPrompt,
        updateMessage,
    };
};

const requeueDelayMs = (
    slackAiPrompt: ReturnType<typeof vi.fn>,
    now: number,
): number => {
    const [{ runAt }] = slackAiPrompt.mock.calls[0] as [{ runAt: Date }];
    return runAt.getTime() - now;
};

describe('queued Slack v3 run requeue', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('polls tightly for a deferred run that has just been queued', async () => {
        const { now, service, slackAiPrompt, updateMessage } = buildService({
            startSlackRunState: 'deferred',
            waitedMs: 2_000,
        });

        await service.replyToSlackPrompt(PROMPT_UUID);

        expect(slackAiPrompt).toHaveBeenCalledTimes(1);
        expect(slackAiPrompt.mock.calls[0][0].payload).toEqual({
            slackPromptUuid: PROMPT_UUID,
            userUuid: 'user-uuid',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
        });
        expect(requeueDelayMs(slackAiPrompt, now)).toBe(
            V3_SLACK_DEFERRED_RUN_DELAY_MS,
        );
        expect(updateMessage).not.toHaveBeenCalled();
    });

    it('backs off to the cap for a long-running blocked thread', async () => {
        const { now, service, slackAiPrompt } = buildService({
            startSlackRunState: 'blocked',
            waitedMs: 5 * 60 * 1_000,
        });

        await service.replyToSlackPrompt(PROMPT_UUID);

        expect(requeueDelayMs(slackAiPrompt, now)).toBe(
            V3_SLACK_QUEUED_RUN_MAX_DELAY_MS,
        );
    });

    it('fails visibly in the Slack thread once past the hard deadline', async () => {
        const {
            cancelSlackRunPlaceholder,
            service,
            slackAiPrompt,
            updateMessage,
        } = buildService({
            startSlackRunState: 'blocked',
            waitedMs: V3_SLACK_QUEUED_RUN_TIMEOUT_MS + 1_000,
        });

        await service.replyToSlackPrompt(PROMPT_UUID);

        expect(slackAiPrompt).not.toHaveBeenCalled();
        expect(cancelSlackRunPlaceholder).toHaveBeenCalledWith(PROMPT_UUID);
        expect(updateMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channelId: CHANNEL_ID,
                messageTs: RESPONSE_TS,
                text: expect.stringContaining('still running'),
            }),
        );
    });
});
