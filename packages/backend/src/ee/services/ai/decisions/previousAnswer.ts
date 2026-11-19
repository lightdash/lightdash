import type { ModelMessage } from 'ai';

const MAX_PREVIOUS_ANSWER_CHARS = 1_200;

/** The agent's last reply, which a short prompt such as "yes" may be answering. */
export type PreviousAnswer = {
    /** The end of the reply's text, where offers and questions sit. */
    text: string;
    /** The reply asked through the askUser tool, so the prompt is its answer. */
    askedUser: boolean;
};

const textOf = (message: ModelMessage): string => {
    if (typeof message.content === 'string') return message.content;
    return message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n');
};

export const getPreviousAnswer = (
    history: ModelMessage[],
): PreviousAnswer | null => {
    const index = history.findLastIndex(
        (message) => message.role === 'assistant' && textOf(message).trim(),
    );
    if (index === -1) return null;
    // That reply's tool calls sit just before its text, back to the user's prompt.
    const firstOfTurn =
        history.findLastIndex(
            (message, i) => i < index && message.role === 'user',
        ) + 1;
    const askedUser = history
        .slice(firstOfTurn, index)
        .some(
            (message) =>
                message.role === 'assistant' &&
                typeof message.content !== 'string' &&
                message.content.some(
                    (part) =>
                        part.type === 'tool-call' &&
                        part.toolName === 'askUser',
                ),
        );
    return {
        text: textOf(history[index]).trim().slice(-MAX_PREVIOUS_ANSWER_CHARS),
        askedUser,
    };
};
