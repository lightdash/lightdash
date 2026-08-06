import { AiDuplicateSlackPromptError } from '@lightdash/common';
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

const CHANNEL_ID = 'C123';
const THREAD_TS = '1700000000.000100';
const USER_ID = 'U123';
const AGENT_UUID = 'agent-uuid';

const buildService = () =>
    new AiAgentService({
        slackAuthenticationModel: {
            getOrganizationUuidFromTeamId: vi
                .fn()
                .mockResolvedValue('org-uuid'),
            getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
                aiRequireOAuth: false,
                aiMultiAgentChannelId: CHANNEL_ID,
            }),
        },
        aiAgentModel: {
            getAgent: vi.fn().mockResolvedValue({
                uuid: AGENT_UUID,
                name: 'Test agent',
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
            }),
        },
        lightdashConfig: {
            siteUrl: 'https://example.com',
            ai: { copilot: {} },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

const buildHandler = ({
    shouldSkipForwardingQuery = false,
}: {
    shouldSkipForwardingQuery?: boolean;
} = {}) => {
    let handler: ((args: Record<string, unknown>) => Promise<void>) | undefined;
    const service = buildService();
    const createAndSchedule = vi.fn(
        async (args: {
            confirmation?: {
                client: { chat: { postMessage: () => Promise<void> } };
            };
        }) => {
            await args.confirmation?.client.chat
                .postMessage()
                .catch(() => undefined);
        },
    );
    const handleAiAgentAuth = vi
        .fn()
        .mockResolvedValue({ userUuid: 'user-uuid' });
    Object.assign(service, {
        createAndScheduleSlackPromptFromAction: createAndSchedule,
        handleAiAgentAuth,
    });

    const app = {
        action: vi.fn(
            (
                _actionId: string,
                actionHandler: (args: Record<string, unknown>) => Promise<void>,
            ) => {
                handler = actionHandler;
            },
        ),
    };
    service.handleAgentSelection(app as unknown as App);

    const postMessage = vi.fn().mockResolvedValue(undefined);
    const postEphemeral = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    const client = {
        chat: {
            update,
            postMessage,
            postEphemeral,
        },
        conversations: {
            replies: vi.fn().mockResolvedValue({
                messages: [
                    {
                        user: USER_ID,
                        text: 'Question',
                        ts: THREAD_TS,
                    },
                ],
            }),
        },
    };
    const invoke = () => {
        if (!handler) throw new Error('Slack handler was not registered');
        return handler({
            ack: vi.fn().mockResolvedValue(undefined),
            body: {
                type: 'block_actions',
                user: { id: USER_ID },
                channel: { id: CHANNEL_ID },
                message: { ts: THREAD_TS, thread_ts: THREAD_TS },
                actions: [
                    {
                        type: 'static_select',
                        selected_option: {
                            value: JSON.stringify({
                                agentUuid: AGENT_UUID,
                                channelId: CHANNEL_ID,
                                shouldSkipForwardingQuery,
                            }),
                        },
                    },
                ],
            },
            client,
            context: { teamId: 'T123', botUserId: 'B123' },
        });
    };

    return {
        invoke,
        createAndSchedule,
        postMessage,
        postEphemeral,
        update,
    };
};

describe('Slack agent picker selection', () => {
    it('posts confirmation after creation and before scheduling', async () => {
        const service = buildService();
        const calls: string[] = [];
        Object.assign(service, {
            createSlackPrompt: vi.fn().mockImplementation(async () => {
                calls.push('create');
                return {
                    promptUuid: 'prompt-uuid',
                    threadUuid: 'thread-uuid',
                };
            }),
            setThinkingStatusAndSchedule: vi
                .fn()
                .mockImplementation(async () => {
                    calls.push('schedule');
                }),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (service as any).createAndScheduleSlackPromptFromAction({
            channelId: CHANNEL_ID,
            threadTs: THREAD_TS,
            agentConfig: {
                uuid: AGENT_UUID,
                name: 'Test agent',
                projectUuid: 'project-uuid',
            },
            confirmation: {
                client: {
                    chat: {
                        postMessage: async () => {
                            calls.push('confirmation');
                        },
                    },
                },
                isMultiAgentChannel: true,
                botUserId: 'B123',
            },
            userUuid: 'user-uuid',
            slackUserId: USER_ID,
            promptText: 'Question',
            promptSlackTs: THREAD_TS,
        });

        expect(calls).toEqual(['create', 'confirmation', 'schedule']);
    });

    it('waits for confirmation before scheduling', async () => {
        const service = buildService();
        const calls: string[] = [];
        let releaseConfirmation: (() => void) | undefined;
        Object.assign(service, {
            createSlackPrompt: vi.fn().mockResolvedValue({
                promptUuid: 'prompt-uuid',
                threadUuid: 'thread-uuid',
            }),
            setThinkingStatusAndSchedule: vi
                .fn()
                .mockImplementation(async () => {
                    calls.push('schedule');
                }),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pending = (service as any).createAndScheduleSlackPromptFromAction(
            {
                channelId: CHANNEL_ID,
                threadTs: THREAD_TS,
                agentConfig: {
                    uuid: AGENT_UUID,
                    name: 'Test agent',
                    projectUuid: 'project-uuid',
                },
                confirmation: {
                    client: {
                        chat: {
                            postMessage: () =>
                                new Promise<void>((resolve) => {
                                    releaseConfirmation = resolve;
                                }),
                        },
                    },
                    isMultiAgentChannel: true,
                    botUserId: 'B123',
                },
                userUuid: 'user-uuid',
                slackUserId: USER_ID,
                promptText: 'Question',
                promptSlackTs: THREAD_TS,
            },
        );

        await vi.waitFor(() => expect(releaseConfirmation).toBeDefined());
        expect(calls).toEqual([]);
        releaseConfirmation?.();
        await pending;

        expect(calls).toEqual(['schedule']);
    });

    it('runs the handler confirmation between creation and scheduling', async () => {
        const fixture = buildHandler();
        const calls: string[] = [];
        fixture.createAndSchedule.mockImplementation(async (args) => {
            calls.push('create');
            await args.confirmation?.client.chat.postMessage();
            calls.push('schedule');
        });
        fixture.postMessage.mockImplementation(async () => {
            calls.push('confirmation');
        });

        await fixture.invoke();

        expect(calls).toEqual(['create', 'confirmation', 'schedule']);
    });

    it('silently suppresses confirmation for duplicate selections', async () => {
        const fixture = buildHandler();
        fixture.createAndSchedule.mockRejectedValue(
            new AiDuplicateSlackPromptError('Prompt already exists'),
        );

        await fixture.invoke();

        expect(fixture.postMessage).not.toHaveBeenCalled();
        expect(fixture.postEphemeral).not.toHaveBeenCalled();
    });

    it('does not block scheduling when confirmation fails', async () => {
        const fixture = buildHandler();
        fixture.postMessage.mockRejectedValue(new Error('Slack unavailable'));

        await expect(fixture.invoke()).resolves.toBeUndefined();
        expect(fixture.createAndSchedule).toHaveBeenCalledOnce();
        expect(fixture.postEphemeral).not.toHaveBeenCalled();
    });

    it('confirms duplicate meta selections by idempotently updating the picker', async () => {
        const fixture = buildHandler({ shouldSkipForwardingQuery: true });

        await fixture.invoke();
        await fixture.invoke();

        expect(fixture.update).toHaveBeenCalledTimes(2);
        expect(fixture.update).toHaveBeenLastCalledWith(
            expect.objectContaining({
                channel: CHANNEL_ID,
                ts: THREAD_TS,
                text: '✅ Agent selected: *Test agent*',
            }),
        );
        expect(fixture.postMessage).not.toHaveBeenCalled();
        expect(fixture.createAndSchedule).not.toHaveBeenCalled();
        expect(fixture.postEphemeral).not.toHaveBeenCalled();
    });
});
