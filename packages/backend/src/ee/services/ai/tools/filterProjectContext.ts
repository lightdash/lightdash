import { serializeAiProjectContextObjectRef } from '@lightdash/common';
import { compileMatcher } from './grepFieldsIndex';
import type { ProjectContextSearchEntry } from './memoryProjectContext';

// A memory has no file id or kind, so it is greppable by slug alone.
const getHaystack = (entry: ProjectContextSearchEntry): string => {
    const labels =
        entry.source === 'memory'
            ? [entry.slug]
            : [entry.id, entry.slug, entry.kind];
    return [
        ...labels,
        ...entry.terms,
        ...entry.objects.map(serializeAiProjectContextObjectRef),
        entry.content,
    ]
        .join('\n')
        .toLowerCase();
};

/**
 * Grep-filter project context entries so the agent loads only what's relevant
 * instead of the whole context. Reuses grepFields' `compileMatcher` (substring
 * AND/OR, ReDoS-safe) over a per-entry haystack (labels + terms + objects +
 * content). An entry matches if it hits ANY pattern; results are ranked by how
 * many patterns they hit (matched-first). Empty patterns → all entries.
 */
export const filterProjectContext = (
    entries: ProjectContextSearchEntry[],
    patterns: string[],
): ProjectContextSearchEntry[] => {
    if (patterns.length === 0) return entries;
    const matchers = patterns.map(compileMatcher);
    return entries
        .map((entry) => {
            const haystack = getHaystack(entry);
            const score = matchers.filter((matches) =>
                matches(haystack),
            ).length;
            return { entry, score };
        })
        .filter((scored) => scored.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((scored) => scored.entry);
};
