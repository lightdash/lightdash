import type { WebClient } from '@slack/web-api';

export type AgentSelectionValue = {
    agentUuid: string;
    // Only carried by pickers posted before the value was shortened to fit
    // Slack's 150-char cap; newer ones leave it to the click event.
    channelId: string | null;
    shouldSkipForwardingQuery: boolean;
    // Absent on pickers posted before the ts was added to the payload.
    promptSlackTs: string | null;
};

const readString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

// Keys are terse to fit the option-value cap; the long names are the legacy shape.
export const parseAgentSelectionValue = (
    value: string,
): AgentSelectionValue | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }

    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }

    const {
        a,
        s,
        t,
        agentUuid,
        channelId,
        shouldSkipForwardingQuery,
        promptSlackTs,
    } = parsed as Record<string, unknown>;

    const resolvedAgentUuid = readString(a) ?? readString(agentUuid);
    if (!resolvedAgentUuid) return null;

    return {
        agentUuid: resolvedAgentUuid,
        channelId: readString(channelId),
        shouldSkipForwardingQuery: Boolean(s ?? shouldSkipForwardingQuery),
        promptSlackTs: readString(t) ?? readString(promptSlackTs),
    };
};

export type SlackThreadMessage = {
    user?: string;
    text?: string;
    ts?: string;
};

export type AgentSelectionPrompt = {
    text: string;
    ts: string;
};

export const findAgentSelectionMessageByTs = (
    messages: SlackThreadMessage[],
    promptSlackTs: string,
): AgentSelectionPrompt | null => {
    const message = messages.find((msg) => msg.ts === promptSlackTs);
    return message?.text ? { text: message.text, ts: promptSlackTs } : null;
};

// Legacy pickers carry no ts: answers the user's first message in the thread.
export const findLegacyAgentSelectionMessage = (
    messages: SlackThreadMessage[],
    args: {
        slackUserId: string;
        botUserId: string | undefined;
        isMultiAgentChannel: boolean;
    },
): AgentSelectionPrompt | null => {
    const message = messages.find((msg) => {
        if (msg.user !== args.slackUserId) return false;
        if (!msg.text) return false;
        if (args.isMultiAgentChannel) return true;
        return msg.text.includes(`<@${args.botUserId}>`);
    });

    return message?.text && message.ts
        ? { text: message.text, ts: message.ts }
        : null;
};

/**
 * Resolve the message an agent picker was posted for, so the selection answers
 * that message rather than one re-derived from thread history.
 */
export const resolveAgentSelectionPrompt = async (
    client: Pick<WebClient, 'conversations'>,
    args: {
        channelId: string;
        threadTs: string | undefined;
        promptSlackTs: string | null;
        slackUserId: string;
        botUserId: string | undefined;
        isMultiAgentChannel: boolean;
    },
): Promise<AgentSelectionPrompt | null> => {
    const { promptSlackTs } = args;

    if (promptSlackTs) {
        // No limit: conversations.replies always returns the thread parent, so
        // a limit would squeeze out the message the window asked for.
        const targeted = await client.conversations.replies({
            channel: args.channelId,
            ts: args.threadTs || promptSlackTs,
            oldest: promptSlackTs,
            latest: promptSlackTs,
            inclusive: true,
        });

        // Never fall back to another message: answering one is the bug.
        return findAgentSelectionMessageByTs(
            targeted.messages ?? [],
            promptSlackTs,
        );
    }

    const conversationHistory = await client.conversations.replies({
        channel: args.channelId,
        ts: args.threadTs || '',
        limit: 100,
    });

    return findLegacyAgentSelectionMessage(conversationHistory.messages ?? [], {
        slackUserId: args.slackUserId,
        botUserId: args.botUserId,
        isMultiAgentChannel: args.isMultiAgentChannel,
    });
};
