import { assertUnreachable } from '@lightdash/common';

export type PillState =
    | 'working'
    | 'ready'
    | 'needs-answer'
    | 'failed'
    | 'idle';

/** On the button a minimised bubble is. */
export const BUBBLE_PILL_ATTRIBUTE = 'data-bubble-pill';

/** What a minimised bubble says about its conversation; the first that holds. */
export const pillState = (is: {
    /** The last message could not be sent. */
    failed: boolean;
    /** A message is on its way out, or the agent is replying or running tools. */
    working: boolean;
    /** The agent ended its turn on a question for the user. */
    asked: boolean;
    /** A reply came that the user has not opened the bubble for. */
    unread: boolean;
}): PillState => {
    if (is.failed) return 'failed';
    if (is.working) return 'working';
    if (is.asked) return 'needs-answer';
    return is.unread ? 'ready' : 'idle';
};

/** The words on the pill; null when it shows the agent's name instead. */
export const pillLabel = (state: PillState): string | null => {
    switch (state) {
        case 'working':
            return 'Working';
        case 'ready':
            return 'Reply ready';
        case 'needs-answer':
            return 'Needs your answer';
        case 'failed':
            return 'Could not send';
        case 'idle':
            return null;
        default:
            return assertUnreachable(state, 'Unknown pill state');
    }
};
