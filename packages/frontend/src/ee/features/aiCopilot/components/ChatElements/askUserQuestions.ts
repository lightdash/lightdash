import {
    toolAskUserArgsSchema,
    type AiAgentMessage,
    type AskUserQuestion,
} from '@lightdash/common';

export type PendingAskUser = {
    toolCallId: string;
    questions: AskUserQuestion[];
};

/** The questions an idle reply ended its turn on; null when it asked none. */
export const getPendingAskUser = (
    message: AiAgentMessage | undefined,
): PendingAskUser | null => {
    if (message?.role !== 'assistant' || message.status !== 'idle') {
        return null;
    }
    const call = message.toolCalls.findLast(
        ({ toolName }) => toolName === 'askUser',
    );
    const parsed = toolAskUserArgsSchema.safeParse(call?.toolArgs);
    return call && parsed.success
        ? { toolCallId: call.toolCallId, questions: parsed.data.questions }
        : null;
};
