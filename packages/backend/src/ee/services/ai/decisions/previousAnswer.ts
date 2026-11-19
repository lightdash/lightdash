import { stripMemoryCitations } from '../utils/memoryCitation';

const MAX_PREVIOUS_ANSWER_CHARS = 1_200;

/** The agent's last reply, which a short prompt such as "yes" may be answering. */
export type PreviousAnswer = {
    /** The end of the reply's text, where offers and questions sit. */
    text: string;
    /** The reply asked through the askUser tool, so the prompt is its answer. */
    askedUser: boolean;
};

export type PreviousPromptReply = {
    response: string | null;
    errorMessage: string | null;
    askedUser: boolean;
};

/** A failed or empty previous turn gives no answer rather than an older one. */
export const getPreviousAnswer = (
    reply: PreviousPromptReply | null,
): PreviousAnswer | null => {
    if (!reply || reply.errorMessage !== null) return null;
    const text = stripMemoryCitations(reply.response ?? '').trim();
    if (!text) return null;
    return {
        text: text.slice(-MAX_PREVIOUS_ANSWER_CHARS),
        askedUser: reply.askedUser,
    };
};
