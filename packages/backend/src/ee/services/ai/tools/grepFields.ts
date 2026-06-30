import { grepFieldsToolDefinition, type Explore } from '@lightdash/common';
import { tool } from 'ai';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    buildFieldIndex,
    compileMatcher,
    summarizeRequiredFilters,
    type FieldEntry,
} from './grepFieldsIndex';

const toolDefinition = grepFieldsToolDefinition.for('agent');

type Dependencies = {
    availableExplores: Explore[];
    // FTS catalog search, reused as a fuzzy fallback when literal grep is dry.
    findExplores: FindExploresFn;
    // Verified-chart usage per field (`table_field::fieldType`), used to rank
    // verified/governed fields first within the grep results.
    verifiedFieldUsage: Map<string, number>;
};

// Turn the regex patterns into a plain-keyword query for the FTS fallback.
const toFtsQuery = (patterns: string[]): string =>
    patterns
        .join(' ')
        .replace(/[|()\\^$.*+?[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const renderFtsFallback = (
    fields: NonNullable<
        Awaited<ReturnType<FindExploresFn>>['topMatchingFields']
    >,
): string => {
    const ranked = [...fields].sort(
        (a, b) =>
            (b.verifiedChartUsage ?? 0) - (a.verifiedChartUsage ?? 0) ||
            (b.chartUsage ?? 0) - (a.chartUsage ?? 0) ||
            (b.searchRank ?? 0) - (a.searchRank ?? 0),
    );
    const lines = ranked
        .map((f) => {
            const verified = f.verifiedChartUsage ? ' ✓verified' : '';
            const desc = f.description
                ? ` — ${f.description.replace(/\s+/g, ' ').slice(0, 140)}`
                : '';
            return `  ${f.tableName}_${f.name}  [${f.fieldType}]${verified} ${f.label}${desc}`;
        })
        .join('\n');
    return `No exact grep matches. Closest catalog matches (fuzzy search, verified fields first):\n${lines}`;
};

// Per-pattern cap so a batch of broad patterns can't flood the context.
const MAX_PER_PATTERN = 40;

const renderHits = (
    hits: FieldEntry[],
    requiredFiltersByExplore: Map<string, string>,
): string => {
    // Verified/governed fields first, then the rest in index order.
    const ordered = [...hits].sort((a, b) => b.verifiedUsage - a.verifiedUsage);
    const byExplore = new Map<string, FieldEntry[]>();
    for (const m of ordered.slice(0, MAX_PER_PATTERN)) {
        const list = byExplore.get(m.exploreName) ?? [];
        list.push(m);
        byExplore.set(m.exploreName, list);
    }
    return [...byExplore.entries()]
        .map(([exploreName, fields]) => {
            const lines = fields
                .map((f) => {
                    const verified = f.verifiedUsage > 0 ? ' ✓verified' : '';
                    const desc = f.description
                        ? ` — ${f.description
                              .replace(/\s+/g, ' ')
                              .slice(0, 160)}`
                        : '';
                    const hint = f.aiHint
                        ? ` (hint: ${f.aiHint
                              .replace(/\s+/g, ' ')
                              .slice(0, 160)})`
                        : '';
                    return `  ${f.path}  [${f.kind} ${f.type}]${verified} ${f.label}${desc}${hint}`;
                })
                .join('\n');
            const requiredFilters = requiredFiltersByExplore.get(exploreName);
            const header = `  ${exploreName} (${
                fields[0]?.exploreLabel ?? exploreName
            })`;
            return requiredFilters
                ? `${header}\n  ${requiredFilters}\n${lines}`
                : `${header}\n${lines}`;
        })
        .join('\n');
};

// One block per pattern so the agent sees which angle matched what.
const renderPattern = (
    pattern: string,
    hits: FieldEntry[],
    requiredFiltersByExplore: Map<string, string>,
): string => {
    if (hits.length === 0) {
        return `/${pattern}/ — no matches.`;
    }
    const capped =
        hits.length > MAX_PER_PATTERN
            ? ` (showing ${MAX_PER_PATTERN} of ${hits.length})`
            : '';
    return `/${pattern}/ — ${hits.length} match${
        hits.length === 1 ? '' : 'es'
    }${capped}:\n${renderHits(hits, requiredFiltersByExplore)}`;
};

/**
 * Deterministic field discovery: grep an in-memory, annotated view of the
 * project's compiled explores (explore = directory, field = file). Reads only
 * the cached explores passed in, so it works for every connection type and
 * never touches the warehouse or git. Gated by the `ai-grep-fields` flag as an
 * alternative to the discoverFields sub-agent.
 */
export const getGrepFields = ({
    availableExplores,
    findExplores,
    verifiedFieldUsage,
}: Dependencies) => {
    let index: FieldEntry[] | null = null;
    const getIndex = () => {
        if (index === null) {
            index = buildFieldIndex(availableExplores, verifiedFieldUsage);
        }
        return index;
    };

    const requiredFiltersByExplore = new Map<string, string>();
    for (const explore of availableExplores) {
        const summary = summarizeRequiredFilters(explore);
        if (summary) requiredFiltersByExplore.set(explore.name, summary);
    }

    return tool({
        ...toolDefinition,
        execute: async ({ patterns, exploreName }) => {
            try {
                const scoped = exploreName
                    ? getIndex().filter((e) => e.exploreName === exploreName)
                    : getIndex();
                // Each pattern is matched against the whole (pre-filtered) index
                // in one pass — "parallel" greps without an extra round-trip.
                const blocks = patterns.map((pattern) => {
                    const matches = compileMatcher(pattern);
                    const hits = scoped.filter((e) => matches(e.haystack));
                    return renderPattern(
                        pattern,
                        hits,
                        requiredFiltersByExplore,
                    );
                });
                const anyHit = blocks.some((b) => !b.includes('— no matches.'));
                if (anyHit) {
                    return {
                        result: blocks.join('\n\n'),
                        metadata: { status: 'success' as const },
                    };
                }

                // Literal grep is dry — fall back to FTS (stemming + recall) so
                // the agent gets matches now instead of re-grepping synonyms.
                // A fallback failure degrades to the plain "no matches" message
                // rather than erroring the whole (otherwise successful) grep.
                let ftsFields: NonNullable<
                    Awaited<
                        ReturnType<typeof findExplores>
                    >['topMatchingFields']
                > = [];
                try {
                    const fallback = await findExplores({
                        fieldSearchSize: 25,
                        searchQuery: toFtsQuery(patterns),
                    });
                    ftsFields = (fallback.topMatchingFields ?? []).filter(
                        (f) => !exploreName || f.tableName === exploreName,
                    );
                } catch {
                    ftsFields = [];
                }
                const scope = exploreName ? ` in explore "${exploreName}"` : '';
                return {
                    result:
                        ftsFields.length > 0
                            ? renderFtsFallback(ftsFields)
                            : `No fields matched any of the patterns${scope}, and the catalog search found nothing close. Try broader or alternative keywords.`,
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error grepping fields'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
};
