type Turn = { role: 'user' | 'assistant'; message: string | null };

const INTRO =
    'This conversation continues an earlier one that ran out of room for screenshots. The earlier exchange, newest first:';

/**
 * The earlier conversation, word for word and newest first, as background
 * for a new one. The oldest turns are dropped to fit `maxLength`.
 */
export const buildCarryOver = (turns: Turn[], maxLength: number): string => {
    const lines = turns
        .filter((turn) => (turn.message ?? '').trim() !== '')
        .map(
            (turn) =>
                `${turn.role === 'user' ? 'User' : 'Agent'}: ${(turn.message ?? '').trim()}`,
        )
        .reverse();
    if (lines.length === 0) return '';
    let text = INTRO;
    for (const line of lines) {
        const next = `${text}\n\n${line}`;
        if (next.length <= maxLength) {
            text = next;
        } else {
            // Room for part of the newest turn only: keep its start.
            if (text === INTRO) text = next.slice(0, maxLength);
            break;
        }
    }
    return text;
};
