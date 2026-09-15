import { type MentionOptions } from '@tiptap/extension-mention';

type FindSuggestionMatch = NonNullable<
    MentionOptions['suggestion']['findSuggestionMatch']
>;

const LEAF_PLACEHOLDER = '\u0000';
const LABEL_START = /^[\p{L}\p{N}_]/u;

const isBoundary = (character: string) =>
    character === LEAF_PLACEHOLDER || character === '\n' || character === '\r';

const hasBoundary = (value: string) => Array.from(value).some(isBoundary);

export type LabelQueryInput = {
    text: string;
    cursor: number;
    char: string;
    allowedPrefixes: string[] | null;
    startOfLine: boolean;
    labels: string[];
};

export type LabelQueryMatch = {
    from: number;
    to: number;
    query: string;
} | null;

const isLabelFragment = (candidate: string, lowerLabels: string[]): boolean => {
    if (candidate === '') return true;
    if (/^\s/.test(candidate)) return false;
    const needle = candidate.toLowerCase();
    return lowerLabels.some((label) => label.includes(needle));
};

/**
 * Finds the `@` query around the cursor, bounding it with the field labels the
 * picker can offer. The query keeps spaces while it still reads as part of a
 * label, and the range covers the whole label even when the cursor sits inside
 * it, so selecting a field leaves no typed text behind.
 */
export const findLabelQuery = ({
    text,
    cursor,
    char,
    allowedPrefixes,
    startOfLine,
    labels,
}: LabelQueryInput): LabelQueryMatch => {
    if (cursor <= 0 || cursor > text.length) return null;

    const charIndex = text.lastIndexOf(char, cursor - 1);
    if (charIndex === -1) return null;
    if (startOfLine && charIndex !== 0) return null;

    const prefix = charIndex === 0 ? '' : text[charIndex - 1];
    if (
        allowedPrefixes !== null &&
        prefix !== '' &&
        prefix !== LEAF_PLACEHOLDER &&
        !allowedPrefixes.includes(prefix)
    ) {
        return null;
    }

    const typed = text.slice(charIndex + 1, cursor);
    if (hasBoundary(typed)) return null;

    const lowerLabels = labels.map((label) => label.toLowerCase());
    const longestLabel = lowerLabels.reduce(
        (max, label) => Math.max(max, label.length),
        0,
    );

    let regionEnd = cursor;
    if (typed.length > 0 || LABEL_START.test(text.slice(cursor, cursor + 1))) {
        const limit = Math.min(
            text.length,
            charIndex + 1 + Math.max(longestLabel, typed.length),
        );
        while (regionEnd < limit && !isBoundary(text[regionEnd])) {
            regionEnd += 1;
        }
    }

    for (let end = regionEnd; end >= cursor; end -= 1) {
        const candidate = text.slice(charIndex + 1, end);
        if (end > cursor && /\s$/.test(candidate)) continue;
        if (isLabelFragment(candidate, lowerLabels)) {
            return { from: charIndex, to: end, query: candidate };
        }
    }

    if (/\s/.test(typed)) return null;

    let wordEnd = cursor;
    while (
        wordEnd < text.length &&
        !/\s/.test(text[wordEnd]) &&
        !isBoundary(text[wordEnd]) &&
        text[wordEnd] !== char
    ) {
        wordEnd += 1;
    }
    return {
        from: charIndex,
        to: wordEnd,
        query: text.slice(charIndex + 1, wordEnd),
    };
};

/**
 * Builds a tiptap suggestion matcher bound to the given field labels.
 */
export const createFieldSuggestionMatch = (
    labels: string[],
): FindSuggestionMatch => {
    const matcher: FindSuggestionMatch = ({
        char,
        allowedPrefixes,
        startOfLine,
        $position,
    }) => {
        const parent = $position.parent;
        if (!parent.isTextblock) return null;

        const text = parent.textBetween(
            0,
            parent.content.size,
            undefined,
            LEAF_PLACEHOLDER,
        );
        if (text.length !== parent.content.size) return null;

        const blockStart = $position.start();
        const match = findLabelQuery({
            text,
            cursor: $position.pos - blockStart,
            char,
            allowedPrefixes,
            startOfLine,
            labels,
        });
        if (!match) return null;

        return {
            range: {
                from: blockStart + match.from,
                to: blockStart + match.to,
            },
            query: match.query,
            text: `${char}${match.query}`,
        };
    };
    return matcher;
};
