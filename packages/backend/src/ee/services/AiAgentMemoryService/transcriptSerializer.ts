import type { DistillTranscript } from './transcriptSanitizer';

export const AI_AGENT_MEMORY_TRANSCRIPT_MAX_CHARS = 400_000;
const HEAD_BUDGET_RATIO = 0.7;

type TranscriptOmission = {
    omittedTurns: number;
    omittedChars: number;
};

type BoundedTranscript = {
    transcriptHead: string;
    omission: TranscriptOmission;
    transcriptTail: string;
};

const serializeBounded = (
    full: string,
    headChars: number,
    tailChars: number,
    turnSpans: Array<{ start: number; end: number }>,
): string => {
    const omittedStart = headChars;
    const omittedEnd = full.length - tailChars;
    const bounded: BoundedTranscript = {
        transcriptHead: full.slice(0, omittedStart),
        omission: {
            omittedTurns: turnSpans.filter(
                ({ start, end }) => start >= omittedStart && end <= omittedEnd,
            ).length,
            omittedChars: omittedEnd - omittedStart,
        },
        transcriptTail: full.slice(omittedEnd),
    };
    return JSON.stringify(bounded);
};

const getTurnSpans = (
    full: string,
    turns: DistillTranscript['turns'],
): Array<{ start: number; end: number }> => {
    let cursor = 0;
    return turns.map((turn) => {
        const serialized = JSON.stringify(turn);
        const start = full.indexOf(serialized, cursor);
        if (start === -1) {
            throw new Error('Serialized turn not found in transcript');
        }
        const end = start + serialized.length;
        cursor = end;
        return { start, end };
    });
};

export const serializeTranscript = (
    transcript: DistillTranscript,
    maxChars = AI_AGENT_MEMORY_TRANSCRIPT_MAX_CHARS,
): string => {
    const full = JSON.stringify(transcript);
    if (full.length <= maxChars) return full;

    const turnSpans = getTurnSpans(full, transcript.turns);
    const empty = serializeBounded(full, 0, 0, turnSpans);
    if (empty.length > maxChars) {
        throw new Error('Transcript budget is too small for omission metadata');
    }

    let low = 0;
    let high = full.length - 1;
    let best = empty;
    while (low <= high) {
        const retainedChars = Math.floor((low + high) / 2);
        const headChars = Math.floor(retainedChars * HEAD_BUDGET_RATIO);
        const tailChars = retainedChars - headChars;
        const candidate = serializeBounded(
            full,
            headChars,
            tailChars,
            turnSpans,
        );
        if (candidate.length <= maxChars) {
            best = candidate;
            low = retainedChars + 1;
        } else {
            high = retainedChars - 1;
        }
    }

    return best;
};
