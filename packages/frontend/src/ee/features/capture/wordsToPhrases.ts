import { type TranscriptPhrase, type TranscriptWord } from './types';

// A pause this long between words starts a new phrase.
const PAUSE_MS = 700;
// People start naming a thing slightly before they start marking it.
const MARK_LEAD_MS = 300;

/**
 * Groups timed words into phrases. A phrase also ends where a new mark
 * begins, so "move this [mark] over to here [mark]" splits between the marks.
 */
export const wordsToPhrases = (
    words: TranscriptWord[],
    options: { offsetMs: number; breakAtMs: number[] },
): TranscriptPhrase[] => {
    const breaks = options.breakAtMs.map((atMs) => atMs - MARK_LEAD_MS);
    const phrases: TranscriptPhrase[] = [];
    let previous: { startMs: number; endMs: number } | null = null;

    for (const word of words) {
        // The recorder starts just before the capture clock, so the first
        // words can fall before zero; they belong at the start.
        const startMs = Math.max(0, word.startMs + options.offsetMs);
        const endMs = Math.max(0, word.endMs + options.offsetMs);
        const last = previous;
        const startsNewPhrase =
            last === null ||
            startMs - last.endMs >= PAUSE_MS ||
            breaks.some((at) => last.startMs < at && startMs >= at);
        if (startsNewPhrase) {
            phrases.push({ atMs: startMs, text: word.text });
        } else {
            phrases[phrases.length - 1].text += ` ${word.text}`;
        }
        previous = { startMs, endMs };
    }
    return phrases;
};
