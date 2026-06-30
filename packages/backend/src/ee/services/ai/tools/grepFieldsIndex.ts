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

// Pure grammatical filler — dropped before the pre-grep so "what is our total
// revenue by country" greps for revenue/country, not "what". Deliberately keeps
// measure words (total, count, sum, average, value, top, …): in BI questions
// those are exactly what disambiguate which metric, so they must stay greppable.
const STOPWORDS = new Set(
    (
        'the a an is are was were be our my we us you your what whats how many much ' +
        'show me give list get tell do does did have has of by for in on to and or ' +
        'with per each all over time across this that these ' +
        'those from which can could would should please into between about above ' +
        'group breakdown break down split'
    ).split(' '),
);

/**
 * Deterministic keyword extraction from the user's question — no LLM. Drops
 * stopwords and short tokens, dedupes, and keeps the most distinctive terms so
 * we can pre-grep the catalog before the agent's first turn.
 */
export const extractKeywords = (text: string): string[] => {
    const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const token of tokens) {
        if (token.length >= 3 && !STOPWORDS.has(token) && !seen.has(token)) {
            seen.add(token);
            kept.push(token);
        }
    }
    return kept.slice(0, 6);
};

/**
 * Score every field by how many of the query keywords it matches and return the
 * best candidates. Multi-keyword matches (e.g. a field hitting both "revenue"
 * and "country") rank first, so the seed surfaces the on-target fields.
 */
export const selectCandidateFields = (
    index: FieldEntry[],
    keywords: string[],
    limit = 25,
): FieldEntry[] => {
    if (keywords.length === 0) return [];
    const scored: { entry: FieldEntry; score: number }[] = [];
    for (const entry of index) {
        let score = 0;
        for (const keyword of keywords) {
            if (entry.haystack.includes(keyword)) score += 1;
        }
        if (score > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Tie-break: metrics first (questions usually want a measure), then the
        // shorter path (less likely to be a deeply-nested edge field).
        if (a.entry.kind !== b.entry.kind)
            return a.entry.kind === 'metric' ? -1 : 1;
        return a.entry.path.length - b.entry.path.length;
    });
    return scored.slice(0, limit).map((s) => s.entry);
};

export const renderCandidateBlock = (candidates: FieldEntry[]): string => {
    const byExplore = new Map<string, FieldEntry[]>();
    for (const c of candidates) {
        const list = byExplore.get(c.exploreName) ?? [];
        list.push(c);
        byExplore.set(c.exploreName, list);
    }
    const blocks = [...byExplore.entries()].map(([exploreName, fields]) => {
        const lines = fields
            .map((f) => {
                const desc = f.description
                    ? ` — ${f.description.replace(/\s+/g, ' ').slice(0, 140)}`
                    : '';
                return `  ${f.path}  [${f.kind} ${f.type}] ${f.label}${desc}`;
            })
            .join('\n');
        return `${exploreName} (${fields[0]?.exploreLabel ?? exploreName})\n${lines}`;
    });
    return [
        'Candidate fields pre-grepped from the catalog for this question (deterministic keyword match — VERIFY these fit before using, and call grepFields yourself if you need different angles or none of these match):',
        '',
        ...blocks,
    ].join('\n');
};
