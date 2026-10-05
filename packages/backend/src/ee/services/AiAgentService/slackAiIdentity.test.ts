import {
    AiIdentityNotReadyError,
    AiIdentityState,
    getAiIdentityPersonMessage,
    type SlackPrompt,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { type AiIdentityModel } from '../../../models/AiIdentityModel';
import { AiAgentService } from './AiAgentService';

const refusalReply =
    "I can't query data for you yet. I've sent you a direct message with the details.";

const undeliveredReply =
    "I can't query data for you yet. Ask an admin about your AI identity.";

const setup = (state = AiIdentityState.NEEDS_SIGN_IN, streaming = false) => {
    const prompt = {
        promptUuid: 'prompt',
        threadUuid: 'thread',
        projectUuid: 'project',
        organizationUuid: 'org',
        createdByUserUuid: 'user',
        slackUserId: 'U123456789',
        slackChannelId: 'C123456789',
        slackThreadTs: 'thread-ts',
        promptSlackTs: 'prompt-ts',
        prompt: 'Show revenue',
    } as SlackPrompt;
    const events: { createdAt: Date }[] = [];
    const findLatestSlackDmEvent = vi.fn<
        AiIdentityModel['findLatestSlackDmEvent']
    >(async ({ since }) => {
        const event = events.findLast(({ createdAt }) => createdAt > since);
        return event ? { ...event, aiIdentityEventUuid: 'event' } : null;
    });
    const addEvent = vi.fn<AiIdentityModel['addEvent']>(async (event) => {
        if (event.status === 'success') events.push({ createdAt: new Date() });
    });
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    const stopAgentStream = vi.fn().mockResolvedValue({ ok: true });
    const service = new AiAgentService({
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://app.test',
        },
        aiIdentityModel: { findLatestSlackDmEvent, addEvent },
        slackClient: {
            postMessage,
            stopAgentStream,
            setAssistantStatus: vi.fn().mockResolvedValue({ ok: true }),
            startAgentStream: vi.fn().mockResolvedValue({ ts: 'stream-ts' }),
            appendAgentStream: vi.fn().mockResolvedValue({ ok: true }),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                userUuid: 'user',
                organizationUuid: 'org',
            }),
        },
        aiAgentModel: {
            findSlackPrompt: vi.fn().mockResolvedValue(prompt),
            getThreadMessages: vi.fn().mockResolvedValue([]),
            findThread: vi.fn().mockResolvedValue({ agentUuid: null }),
            updateSlackResponseTs: vi.fn().mockResolvedValue(undefined),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(
        service as unknown as {
            createAuditedAbility: () => { can: () => boolean };
        },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => false });
    vi.spyOn(service, 'getDecisionClient').mockResolvedValue(undefined);
    vi.spyOn(service, 'getChatHistoryFromThreadMessages').mockResolvedValue([]);
    vi.spyOn(service, 'generateOrStreamAgentResponse').mockImplementation(
        async (_user, _conversation, options) => {
            if (streaming) {
                await options.onSlackStepProgress?.(
                    'Preparing query',
                    'runSql',
                    'query-step',
                    'in_progress',
                );
            }
            throw new AiIdentityNotReadyError(state);
        },
    );
    const refuse = async () => {
        if (streaming) {
            await service.replyToSlackPrompt('prompt');
        } else {
            await expect(service.replyToSlackPrompt('prompt')).rejects.toThrow(
                'Failed to generate response',
            );
        }
    };
    return {
        service,
        refuse,
        postMessage,
        stopAgentStream,
        findLatestSlackDmEvent,
        addEvent,
    };
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it.each([
    AiIdentityState.NEEDS_SIGN_IN,
    AiIdentityState.PENDING,
    AiIdentityState.FAILED,
])(
    'sends the %s details only to the asker and records the attempt',
    async (state) => {
        const { refuse, postMessage, addEvent, findLatestSlackDmEvent } =
            setup(state);
        await refuse();
        expect(postMessage).toHaveBeenCalledWith({
            organizationUuid: 'org',
            channel: 'U123456789',
            text: `${getAiIdentityPersonMessage(state)}\n<https://app.test/generalSettings/myWarehouseConnections|Open your settings>`,
        });
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123456789',
                thread_ts: 'thread-ts',
                text: `🔴 ${refusalReply}`,
            }),
        );
        expect(findLatestSlackDmEvent).toHaveBeenCalledWith({
            organizationUuid: 'org',
            userUuid: 'user',
            since: new Date('2026-10-04T12:00:00Z'),
        });
        expect(addEvent).toHaveBeenCalledExactlyOnceWith({
            organizationUuid: 'org',
            aiIdentityAccountUuid: null,
            aiIdentityUuid: null,
            actorType: 'scheduler',
            actorUserUuid: 'user',
            action: 'slack_dm',
            targetCount: 1,
            status: 'success',
            detail: null,
        });
    },
);

it('suppresses a second refusal within 24 hours and sends again at 24 hours', async () => {
    const { refuse, postMessage, addEvent } = setup();
    await refuse();
    vi.setSystemTime(new Date('2026-10-06T11:59:59Z'));
    await refuse();
    expect(addEvent).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    await refuse();
    expect(addEvent).toHaveBeenCalledTimes(2);
    expect(
        postMessage.mock.calls.filter(
            ([message]) => message.channel === 'U123456789',
        ),
    ).toHaveLength(2);
});

it.each(['reject', 'not_ok'] as const)(
    'logs a DM failure (%s), records it, and replies without pointing to a DM',
    async (failure) => {
        const { refuse, postMessage, addEvent } = setup();
        const warn = vi.spyOn(Logger, 'warn');
        if (failure === 'reject')
            postMessage.mockRejectedValueOnce(new Error('Slack unavailable'));
        else postMessage.mockResolvedValueOnce({ ok: false });
        await refuse();
        expect(warn).toHaveBeenCalledWith(
            'Failed to send AI identity Slack DM',
            expect.any(Error),
        );
        expect(addEvent).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'error' }),
        );
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'C123456789',
                text: `🔴 ${undeliveredReply}`,
            }),
        );
    },
);

it('points to the earlier DM within 24 hours', async () => {
    const { refuse, postMessage } = setup();
    await refuse();
    await refuse();
    expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
            channel: 'C123456789',
            text: "🔴 I can't query data for you yet. See the direct message I sent you earlier.",
        }),
    );
});

it('keeps a reply when the event lookup fails', async () => {
    const { refuse, findLatestSlackDmEvent, postMessage } = setup();
    findLatestSlackDmEvent.mockRejectedValue(new Error('Database unavailable'));
    await refuse();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            channel: 'C123456789',
            text: `🔴 ${undeliveredReply}`,
        }),
    );
});

it('uses the generic refusal on an active stream and sends one DM', async () => {
    const { refuse, postMessage, stopAgentStream, addEvent } = setup(
        AiIdentityState.FAILED,
        true,
    );
    await refuse();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ channel: 'U123456789' }),
    );
    expect(stopAgentStream).toHaveBeenCalledWith(
        expect.objectContaining({ text: refusalReply, messageTs: 'stream-ts' }),
    );
    expect(addEvent).toHaveBeenCalledOnce();
});
