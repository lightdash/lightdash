import {
    ASK_USER_TOOL_NAME,
    parseAskUserCall,
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
        ({ toolName }) => toolName === ASK_USER_TOOL_NAME,
    );
    const args = call ? parseAskUserCall(call.toolName, call.toolArgs) : null;
    return call && args
        ? { toolCallId: call.toolCallId, questions: args.questions }
        : null;
};
