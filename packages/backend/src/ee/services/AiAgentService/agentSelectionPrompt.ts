/**
 * Resolving which message an agent picker was posted for.
 *
 * The picker carries the triggering message's ts in its action value, so the
 * handler answers that message rather than re-deriving one from thread history.
 */

export type AgentSelectionValue = {
    agentUuid: string;
    channelId: string;
    shouldSkipForwardingQuery: boolean;
    // Absent on pickers posted before the ts was added to the payload.
    promptSlackTs: string | null;
};

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

    const { agentUuid, channelId, shouldSkipForwardingQuery, promptSlackTs } =
        parsed as Record<string, unknown>;

    if (typeof agentUuid !== 'string' || agentUuid === '') return null;
    if (typeof channelId !== 'string' || channelId === '') return null;

    return {
        agentUuid,
        channelId,
        shouldSkipForwardingQuery: shouldSkipForwardingQuery === true,
        promptSlackTs:
            typeof promptSlackTs === 'string' && promptSlackTs !== ''
                ? promptSlackTs
                : null,
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

/**
 * Fallback for pickers posted without a ts: the user's first message in the
 * thread, narrowed to bot mentions outside the multi-agent channel. Answers the
 * thread root rather than the message that opened the picker.
 */
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

    return message?.text ? { text: message.text, ts: message.ts ?? '' } : null;
};
