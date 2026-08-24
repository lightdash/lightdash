// Board-only view helpers over the copied ask.ts. Lightdash side only: nothing
// here has a twin in lightdash-university.

import {
    assertUnreachable,
    type LearnAskMatch,
    type LearnCatalogueEntry,
} from '@lightdash/common';
import {
    askHighlights,
    lockedLabel,
    type AskHighlights,
    type AskMatch,
} from './ask';

/** The results list stops at five: past that it stops reading as an answer. */
export const ASK_RESULT_LIMIT = 5;

const DIM_OPACITY = 0.4;

export type NodeAskState = 'none' | 'matched' | 'locked-match' | 'dimmed';

/**
 * The search ranks embeddings and can name a module this catalogue does not
 * carry. Resolve against the library and cap once, so the list and the lit
 * nodes are the same set.
 */
export const resolveMatches = (
    matches: LearnAskMatch[],
    entries: LearnCatalogueEntry[],
): LearnAskMatch[] => {
    const known = new Set(entries.map((entry) => entry.id));
    return matches
        .filter((match) => known.has(match.courseId))
        .slice(0, ASK_RESULT_LIMIT);
};

// The published match carries `lessonId: string | null` where the copied
// AskMatch declares it optional; only the course id is read either way.
const asAskMatch = ({ courseId, title, score }: LearnAskMatch): AskMatch => ({
    courseId,
    title,
    score,
});

export const boardHighlights = (
    matches: LearnAskMatch[],
    entries: LearnCatalogueEntry[],
    held: string[],
): AskHighlights => askHighlights(matches.map(asAskMatch), entries, held);

export const nodeAskState = (
    id: string,
    highlights: AskHighlights | null,
): NodeAskState => {
    if (highlights === null) return 'none';
    if (highlights.matched.has(id)) return 'matched';
    if (highlights.locked.has(id)) return 'locked-match';
    return 'dimmed';
};

export const askOpacity = (
    state: NodeAskState,
    motionOpacity: number,
): number => {
    switch (state) {
        case 'none':
        case 'matched':
            return motionOpacity;
        case 'dimmed':
            return motionOpacity * DIM_OPACITY;
        case 'locked-match':
            return DIM_OPACITY;
        default:
            return assertUnreachable(state, 'Unknown ask state');
    }
};

export const askScale = (state: NodeAskState, motionScale: number): number => {
    switch (state) {
        case 'none':
        case 'matched':
        case 'dimmed':
            return motionScale;
        case 'locked-match':
            return 1;
        default:
            return assertUnreachable(state, 'Unknown ask state');
    }
};

export type AskGroup = {
    courseId: string;
    matches: LearnAskMatch[];
};

export const groupMatches = (matches: LearnAskMatch[]): AskGroup[] => {
    const groups: AskGroup[] = [];
    const byCourse = new Map<string, AskGroup>();
    for (const result of matches) {
        const existing = byCourse.get(result.courseId);
        if (existing) {
            existing.matches.push(result);
            continue;
        }
        const group: AskGroup = {
            courseId: result.courseId,
            matches: [result],
        };
        byCourse.set(result.courseId, group);
        groups.push(group);
    }
    return groups;
};

/** Who can reach a module the selected role cannot, for a locked match. */
export const lockedNote = (entry: LearnCatalogueEntry): string =>
    lockedLabel(entry) ?? 'custom roles only';
