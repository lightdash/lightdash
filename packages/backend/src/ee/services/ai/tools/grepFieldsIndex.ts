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
    // How many verified charts use this field (0 = not in any verified chart).
    // Governs verified-first ranking; 0 when no usage map is supplied.
    verifiedUsage: number;
};

/**
 * @param verifiedUsage Project-wide verified-chart usage keyed
 * `table_field::fieldType` (from getVerifiedFieldUsage). Optional — when
 * omitted every entry's verifiedUsage is 0 and ranking is keyword-only.
 */
export const buildFieldIndex = (
    explores: Explore[],
    verifiedUsage?: Map<string, number>,
): FieldEntry[] => {
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
                        verifiedUsage:
                            verifiedUsage?.get(`${fieldId}::${kind}`) ?? 0,
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
 * Compare two scored entries: more keyword matches first, then verified-first
 * (a field used in verified charts wins the tie — governed fields get a bit
 * more weight without overriding relevance), then metrics, then shorter path.
 */
const compareScored = (
    a: { entry: FieldEntry; score: number },
    b: { entry: FieldEntry; score: number },
): number => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.entry.verifiedUsage !== a.entry.verifiedUsage) {
        return b.entry.verifiedUsage - a.entry.verifiedUsage;
    }
    if (a.entry.kind !== b.entry.kind) {
        return a.entry.kind === 'metric' ? -1 : 1;
    }
    return a.entry.path.length - b.entry.path.length;
};

/**
 * Score every field by how many of the query keywords it matches and return the
 * best candidates. Multi-keyword matches (e.g. a field hitting both "revenue"
 * and "country") rank first; verified fields win ties.
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
    scored.sort(compareScored);
    return scored.slice(0, limit).map((s) => s.entry);
};

const fieldLine = (f: FieldEntry): string => {
    const verified = f.verifiedUsage > 0 ? ' ✓verified' : '';
    const desc = f.description
        ? ` — ${f.description.replace(/\s+/g, ' ').slice(0, 140)}`
        : '';
    return `  ${f.path}  [${f.kind} ${f.type}]${verified} ${f.label}${desc}`;
};

export const renderCandidateBlock = (candidates: FieldEntry[]): string => {
    const byExplore = new Map<string, FieldEntry[]>();
    for (const c of candidates) {
        const list = byExplore.get(c.exploreName) ?? [];
        list.push(c);
        byExplore.set(c.exploreName, list);
    }
    const blocks = [...byExplore.entries()].map(([exploreName, fields]) => {
        const lines = fields.map(fieldLine).join('\n');
        return `${exploreName} (${fields[0]?.exploreLabel ?? exploreName})\n${lines}`;
    });
    return [
        'Candidate fields pre-grepped from the catalog for this question (deterministic keyword match — VERIFY these fit before using, and call grepFields yourself if you need different angles or none of these match):',
        '',
        ...blocks,
    ].join('\n');
};
