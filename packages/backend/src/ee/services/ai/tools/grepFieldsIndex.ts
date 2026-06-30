import {
    convertFieldRefToFieldId,
    isJoinModelRequiredFilter,
    type Explore,
} from '@lightdash/common';

/** aiHint can be a string or string[]; flatten to one space-joined string. */
const flatHint = (hint?: string | string[]): string =>
    Array.isArray(hint) ? hint.join(' ') : (hint ?? '');

/**
 * One-line summary of an explore's required filters, or null if none. Any query
 * against the explore must apply these — surfacing it keeps grepFields from
 * losing the signal findExplores used to carry.
 */
export const summarizeRequiredFilters = (explore: Explore): string | null => {
    const filters = explore.tables[explore.baseTable]?.requiredFilters ?? [];
    if (filters.length === 0) return null;
    const parts = filters.map((filter) => {
        const tableName = isJoinModelRequiredFilter(filter)
            ? filter.target.tableName
            : explore.baseTable;
        const fieldId = convertFieldRefToFieldId(
            filter.target.fieldRef,
            tableName,
        );
        const values =
            filter.values && filter.values.length > 0
                ? ` ${JSON.stringify(filter.values)}`
                : '';
        return `${fieldId} ${filter.operator}${values}`;
    });
    return `⚠ required filters (must be applied): ${parts.join('; ')}`;
};

/** One greppable "file": a field flattened with its searchable annotations. */
export type FieldEntry = {
    exploreName: string;
    exploreLabel: string;
    path: string;
    kind: 'dimension' | 'metric';
    type: string;
    label: string;
    description: string;
    aiHint: string;
    haystack: string;
};

export const buildFieldIndex = (explores: Explore[]): FieldEntry[] => {
    const entries: FieldEntry[] = [];
    for (const explore of explores) {
        const exploreHints = [
            explore.label,
            flatHint(explore.aiHint),
            ...(explore.tags ?? []),
        ]
            .filter(Boolean)
            .join(' ');
        for (const table of Object.values(explore.tables ?? {})) {
            const fields = [
                ...Object.values(table.dimensions ?? {}).map(
                    (f) => ['dimension', f] as const,
                ),
                ...Object.values(table.metrics ?? {}).map(
                    (f) => ['metric', f] as const,
                ),
            ];
            for (const [kind, field] of fields) {
                if (!field.hidden) {
                    const fieldId = `${field.table}_${field.name}`;
                    const description = field.description ?? '';
                    const aiHint = flatHint(field.aiHint);
                    const annotations = [
                        fieldId,
                        field.label,
                        description,
                        aiHint,
                        ...(field.tags ?? []),
                        exploreHints,
                    ]
                        .filter(Boolean)
                        .join('\n');
                    entries.push({
                        exploreName: explore.name,
                        exploreLabel: explore.label,
                        path: `${explore.name}/${fieldId}`,
                        kind,
                        type: String(field.type),
                        label: field.label,
                        description,
                        aiHint,
                        haystack: annotations.toLowerCase(),
                    });
                }
            }
        }
    }
    return entries;
};

/**
 * Compile a pattern to a matcher WITHOUT a regex engine, so a model-supplied
 * (and therefore prompt-injectable) pattern can never trigger catastrophic
 * backtracking / ReDoS — running `new RegExp("(a+)+$").test(...)` over a single
 * 40-char string blocks Node's event loop for ~60s, which would freeze the
 * whole pod.
 *
 * Semantics that cover how the agent actually patterns:
 *  - `|` separates OR-alternatives ("revenue|sales").
 *  - within an alternative, whitespace / `.*` / `.+` / `.` separate AND-terms
 *    ("order.*status" → both "order" and "status" present, any order).
 *  - terms are matched as case-insensitive substrings.
 */
export const compileMatcher = (
    pattern: string,
): ((haystack: string) => boolean) => {
    const alternatives = pattern
        .toLowerCase()
        .split('|')
        .map((alt) =>
            alt
                .split(/\s+|\.\*|\.\+|[.*+?]/)
                .map((term) => term.replace(/[^a-z0-9_]+/g, ''))
                .filter(Boolean),
        )
        .filter((terms) => terms.length > 0);
    if (alternatives.length === 0) return () => false;
    return (haystack) =>
        alternatives.some((terms) =>
            terms.every((term) => haystack.includes(term)),
        );
};
