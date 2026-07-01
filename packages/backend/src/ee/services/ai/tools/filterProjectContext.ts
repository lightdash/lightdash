import type { ProjectContextEntry } from '@lightdash/common';
import { compileMatcher } from './grepFieldsIndex';

/**
 * Grep-filter project context entries so the agent loads only what's relevant
 * instead of the whole context. Reuses grepFields' `compileMatcher` (substring
 * AND/OR, ReDoS-safe) over a per-entry haystack (id + kind + terms + objects +
 * content). An entry matches if it hits ANY pattern; results are ranked by how
 * many patterns they hit (matched-first). Empty patterns → all entries.
 */
export const filterProjectContext = (
    entries: ProjectContextEntry[],
    patterns: string[],
): ProjectContextEntry[] => {
    if (patterns.length === 0) return entries;
    const matchers = patterns.map(compileMatcher);
    return entries
        .map((entry) => {
            const haystack = [
                entry.id,
                entry.kind,
                ...entry.terms,
                ...entry.objects,
                entry.content,
            ]
                .join('\n')
                .toLowerCase();
            const score = matchers.filter((matches) =>
                matches(haystack),
            ).length;
            return { entry, score };
        })
        .filter((scored) => scored.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((scored) => scored.entry);
};
