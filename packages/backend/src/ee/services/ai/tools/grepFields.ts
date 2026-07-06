import { grepFieldsToolDefinition, type Explore } from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    buildExploreIndex,
    buildFieldIndex,
    buildMetricAmbiguityNote,
    compileMatcher,
    summarizeRequiredFilters,
    type ExploreEntry,
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

// A pattern that matches every field in a scope this large carries no signal —
// it's the grep equivalent of `grep .` — so it must not count as a hit (and
// must not suppress the FTS fallback).
const ALL_MATCH_NO_SIGNAL_MIN = 25;

// Where the pattern matched, most-specific first: the field's own name/label
// beats its description, which beats its ai hint. Keeps a name-matching field
// visible above the display cap even when many popular fields match loosely.
const localityScore = (
    entry: FieldEntry,
    matches: (haystack: string) => boolean,
): number => {
    if (matches(entry.nameHaystack)) return 3;
    if (matches(entry.descHaystack)) return 2;
    if (matches(entry.hintHaystack)) return 1;
    return 0;
};

const renderHits = (
    hits: FieldEntry[],
    matches: (haystack: string) => boolean,
    requiredFiltersByExplore: Map<string, string>,
): string => {
    // Match locality first (name > description > hint), then verified usage.
    const ordered = [...hits].sort(
        (a, b) =>
            localityScore(b, matches) - localityScore(a, matches) ||
            b.verifiedUsage - a.verifiedUsage,
    );
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

// Explores whose own name/label/hint matched, minus ones already visible via
// field hits — a compact pointer instead of dumping their full field lists.
const renderExplorePointers = (
    exploreHits: ExploreEntry[],
    fieldHits: FieldEntry[],
): string | null => {
    const coveredExplores = new Set(fieldHits.map((h) => h.exploreName));
    const pointers = exploreHits.filter(
        (e) => !coveredExplores.has(e.exploreName),
    );
    if (pointers.length === 0) return null;
    const names = pointers
        .slice(0, 8)
        .map((e) => `${e.exploreName} (${e.exploreLabel})`)
        .join(', ');
    return `  explores whose name/label/hint match: ${names} — grep within one (exploreName) or call getMetadata.`;
};

// One block per pattern so the agent sees which angle matched what.
const renderPattern = (
    pattern: string,
    hits: FieldEntry[],
    exploreHits: ExploreEntry[],
    matches: (haystack: string) => boolean,
    scopeSize: number,
    requiredFiltersByExplore: Map<string, string>,
): { text: string; isSignal: boolean } => {
    if (hits.length === scopeSize && scopeSize >= ALL_MATCH_NO_SIGNAL_MIN) {
        return {
            text: `/${pattern}/ — matched all ${hits.length} fields in scope, so it carries no signal. Use more specific terms.`,
            isSignal: false,
        };
    }
    const explorePointers = renderExplorePointers(exploreHits, hits);
    if (hits.length === 0) {
        return explorePointers
            ? {
                  text: `/${pattern}/ — no direct field matches.\n${explorePointers}`,
                  isSignal: true,
              }
            : { text: `/${pattern}/ — no matches.`, isSignal: false };
    }
    const capped =
        hits.length > MAX_PER_PATTERN
            ? ` (showing ${MAX_PER_PATTERN} of ${hits.length})`
            : '';
    const body = renderHits(hits, matches, requiredFiltersByExplore);
    const ambiguityNote = buildMetricAmbiguityNote(hits);
    const extras = [ambiguityNote, explorePointers]
        .filter(Boolean)
        .map((line) => `\n${line}`)
        .join('');
    return {
        text: `/${pattern}/ — ${hits.length} match${
            hits.length === 1 ? '' : 'es'
        }${capped}:\n${body}${extras}`,
        isSignal: true,
    };
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
    let exploreIndex: ExploreEntry[] | null = null;
    const getExploreIndex = () => {
        if (exploreIndex === null) {
            exploreIndex = buildExploreIndex(availableExplores);
        }
        return exploreIndex;
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
                // When already scoped to one explore, explore-level pointers
                // add nothing — the agent is inside that explore.
                const scopedExplores = exploreName ? [] : getExploreIndex();
                // Each pattern is matched against the whole (pre-filtered) index
                // in one pass — "parallel" greps without an extra round-trip.
                const perPattern = patterns.map((pattern) => {
                    const matches = compileMatcher(pattern);
                    const hits = scoped.filter((e) => matches(e.haystack));
                    const exploreHits = scopedExplores.filter((e) =>
                        matches(e.haystack),
                    );
                    return {
                        pattern,
                        hits,
                        block: renderPattern(
                            pattern,
                            hits,
                            exploreHits,
                            matches,
                            scoped.length,
                            requiredFiltersByExplore,
                        ),
                    };
                });
                const blocks = perPattern.map((p) => p.block);
                // Persisted with the tool result: makes grep quality observable
                // in production. matchedAllFields is the fingerprint of a
                // too-broad or broken grep.
                const patternStats = perPattern.map((p) => ({
                    pattern: p.pattern,
                    matchCount: p.hits.length,
                    scopeSize: scoped.length,
                    matchedAllFields:
                        scoped.length > 0 && p.hits.length === scoped.length,
                }));
                if (patternStats.some((s) => s.matchedAllFields)) {
                    Logger.warn('grepFields pattern matched all fields', {
                        patterns,
                        exploreName,
                        scopeSize: scoped.length,
                    });
                }

                // FTS (stemming + recall) runs on EVERY grep, not just dry
                // ones: a grep that "succeeds" with plausible-but-wrong hits
                // would otherwise suppress the search mode that finds what the
                // literal grep missed. Failures degrade to grep-only results.
                let ftsFields: NonNullable<
                    Awaited<
                        ReturnType<typeof findExplores>
                    >['topMatchingFields']
                > = [];
                try {
                    const scopedFieldIds = new Set(
                        scoped.map((field) => field.path.split('/')[1]),
                    );
                    const fts = await findExplores({
                        fieldSearchSize: 25,
                        searchQuery: toFtsQuery(patterns),
                    });
                    ftsFields = (fts.topMatchingFields ?? []).filter(
                        (f) =>
                            !exploreName ||
                            scopedFieldIds.has(`${f.tableName}_${f.name}`),
                    );
                } catch {
                    ftsFields = [];
                }

                const blocksText = blocks.map((b) => b.text).join('\n\n');
                const anyHit = blocks.some((b) => b.isSignal);
                if (anyHit) {
                    // Cross-check: append only FTS fields the grep did not
                    // already surface, so stemmed matches aren't lost without
                    // duplicating what the agent can already see.
                    const greppedFieldIds = new Set(
                        perPattern.flatMap((p) =>
                            p.hits.map((h) => h.path.split('/')[1]),
                        ),
                    );
                    const novel = ftsFields.filter(
                        (f) => !greppedFieldIds.has(`${f.tableName}_${f.name}`),
                    );
                    const crossCheck =
                        novel.length > 0
                            ? `\n\nCatalog fuzzy search also matches (not in the grep results above):\n${novel
                                  .slice(0, 8)
                                  .map(
                                      (f) =>
                                          `  ${f.tableName}_${f.name}  [${f.fieldType}] ${f.label}`,
                                  )
                                  .join('\n')}`
                            : '';
                    return {
                        result: `${blocksText}${crossCheck}`,
                        metadata: { status: 'success' as const, patternStats },
                    };
                }

                const scope = exploreName ? ` in explore "${exploreName}"` : '';
                // Keep the per-pattern diagnosis (e.g. "matched all N fields")
                // in front of the fallback so the agent knows WHY grep is dry.
                return {
                    result:
                        ftsFields.length > 0
                            ? `${blocksText}\n\n${renderFtsFallback(ftsFields)}`
                            : `${blocksText}\n\nNo fields matched any of the patterns${scope}, and the catalog search found nothing close. Try broader or alternative keywords.`,
                    metadata: { status: 'success' as const, patternStats },
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
