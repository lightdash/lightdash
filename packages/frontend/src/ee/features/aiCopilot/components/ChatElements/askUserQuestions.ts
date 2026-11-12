import {
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
    for (const call of [...message.toolCalls].reverse()) {
        const args = parseAskUserCall(call.toolName, call.toolArgs);
        if (args) {
            return { toolCallId: call.toolCallId, questions: args.questions };
        }
    }
    return null;
};
