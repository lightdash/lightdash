import { assertUnreachable } from '@lightdash/common';
import { type CaptureMark, type Point, type TranscriptPhrase } from './types';

// Speech this close to a mark (before its start, after its end) belongs to it.
const LEAD_MS = 1500;
const TRAIL_MS = 2000;

const NOT_SHOWN = -1;

const LAST_LINE =
    'Speech is machine-transcribed and may mishear names. Trust the image where they disagree.';

export const formatClock = (ms: number): string => {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const seconds = totalSeconds % 60;
    return `${Math.floor(totalSeconds / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const third = (value: number): 0 | 1 | 2 => {
    if (value < 1 / 3) return 0;
    if (value < 2 / 3) return 1;
    return 2;
};

export const describePosition = (p: Point): string => {
    const row = ['top', 'middle', 'bottom'][third(p.y)];
    const column = ['left', 'centre', 'right'][third(p.x)];
    if (row === 'middle' && column === 'centre') return 'middle';
    return `${row} ${column}`;
};

const markNumber = (n: number): string =>
    n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : `(${n})`;

const describeMark = (mark: CaptureMark): string => {
    const centre = {
        x: mark.box.x + mark.box.width / 2,
        y: mark.box.y + mark.box.height / 2,
    };
    switch (mark.shape) {
        case 'circle':
            return `circled, ${describePosition(centre)}`;
        case 'underline':
            return `underlined, ${describePosition(centre)}`;
        case 'scribble':
            return `marked, ${describePosition(centre)}`;
        case 'arrow': {
            if (!mark.arrow) return `marked, ${describePosition(centre)}`;
            const from =
                mark.target?.label ?? describePosition(mark.arrow.from);
            const to = mark.arrowTo?.label ?? describePosition(mark.arrow.to);
            return `arrow from ${from} to ${to}`;
        }
        case 'pick':
            return mark.target
                ? `picked "${mark.target.label}"`
                : `picked, ${describePosition(centre)}`;
        default:
            return assertUnreachable(mark.shape, 'Unknown mark shape');
    }
};

const header = (durationMs: number, imageCount: number): string => {
    const clock = formatClock(durationMs);
    if (imageCount === 0)
        return `[Design Mode capture, ${clock}. No marks were drawn.]`;
    if (imageCount === 1)
        return `[Design Mode capture, ${clock}. The attached image shows the page with numbered red marks.]`;
    return `[Design Mode capture, ${clock}. The ${imageCount} attached images show the page with numbered red marks, in order.]`;
};

type Entry =
    | { kind: 'mark'; atMs: number; mark: CaptureMark; speech: string[] }
    | { kind: 'speech'; atMs: number; text: string };

/** Attaches each phrase to the mark it was said with; the rest stay loose. */
const assignSpeech = (
    marks: CaptureMark[],
    transcript: TranscriptPhrase[],
): { speechByMark: Map<number, string[]>; loose: TranscriptPhrase[] } => {
    const speechByMark = new Map<number, string[]>();
    const loose: TranscriptPhrase[] = [];
    for (const phrase of transcript) {
        const owner = marks.findLast(
            (mark) =>
                phrase.atMs >= mark.startMs - LEAD_MS &&
                phrase.atMs <= mark.endMs + TRAIL_MS,
        );
        if (owner) {
            speechByMark.set(owner.number, [
                ...(speechByMark.get(owner.number) ?? []),
                phrase.text,
            ]);
        } else {
            loose.push(phrase);
        }
    }
    return { speechByMark, loose };
};

export const buildSummary = (input: {
    durationMs: number;
    imageCount: number;
    marks: CaptureMark[];
    transcript: TranscriptPhrase[];
}): string => {
    const { speechByMark, loose } = assignSpeech(input.marks, input.transcript);
    const entries: Entry[] = [
        ...input.marks.map((mark) => ({
            kind: 'mark' as const,
            atMs: mark.startMs,
            mark,
            speech: speechByMark.get(mark.number) ?? [],
        })),
        ...loose.map((phrase) => ({
            kind: 'speech' as const,
            atMs: phrase.atMs,
            text: phrase.text,
        })),
    ];
    entries.sort((a, b) => a.atMs - b.atMs);

    const tabs = new Set(input.marks.map((mark) => mark.tabName));
    const spansTabs = tabs.size > 1;
    const lines = [header(input.durationMs, input.imageCount)];
    // Marks past the attached images share one heading and name no image.
    const groupOf = (mark: CaptureMark): number =>
        mark.imageIndex < input.imageCount ? mark.imageIndex : NOT_SHOWN;
    const hasUnshown =
        input.imageCount > 0 &&
        input.marks.some((mark) => groupOf(mark) === NOT_SHOWN);
    let currentGroup: number | null = null;
    for (const entry of entries) {
        if (entry.kind === 'speech') {
            lines.push(`- (${formatClock(entry.atMs)}) "${entry.text}"`);
        } else {
            const { mark } = entry;
            const group = groupOf(mark);
            const changed = group !== currentGroup;
            if (hasUnshown && changed && group === NOT_SHOWN) {
                lines.push('Not shown in an image:');
            } else if (
                changed &&
                group !== NOT_SHOWN &&
                (input.imageCount > 1 || currentGroup === NOT_SHOWN)
            ) {
                lines.push(
                    group === 0
                        ? 'Image 1:'
                        : `Image ${group + 1} (after scrolling or clicking):`,
                );
            }
            if (hasUnshown || input.imageCount > 1) currentGroup = group;
            const target =
                mark.target && mark.shape !== 'arrow' && mark.shape !== 'pick'
                    ? ` on ${mark.target.label}`
                    : '';
            const tab =
                spansTabs && mark.tabName ? `, on tab "${mark.tabName}"` : '';
            const speech =
                entry.speech.length > 0 ? `: "${entry.speech.join(' ')}"` : '';
            lines.push(
                `- ${markNumber(mark.number)} (${formatClock(mark.startMs)}) ${describeMark(mark)}${target}${tab}${speech}`,
            );
        }
    }
    lines.push(LAST_LINE);
    return lines.join('\n');
};
