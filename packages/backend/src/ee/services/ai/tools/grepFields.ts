import {
    grepFieldsInputSchema,
    grepFieldsResultSchema,
    grepFieldsToolDefinition,
    type Explore,
} from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import Logger from '../../../../logging/logger';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
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

type MatchFn = (haystack: string) => boolean;

type FtsFieldMatch = NonNullable<
    Awaited<ReturnType<FindExploresFn>>['topMatchingFields']
>[number];

type ToolGrepFieldsArgs = z.infer<typeof grepFieldsInputSchema>;
type GrepFieldsResult = z.infer<typeof grepFieldsResultSchema>;

type ExecuteStructuredToolResult<TStructuredContent> = {
    result: string;
    metadata: {
        status: 'success';
        patternStats: {
            pattern: string;
            matchCount: number;
            scopeSize: number;
            matchedAllFields: boolean;
        }[];
    };
    structuredContent: TStructuredContent;
};

// Turn the regex patterns into a plain-keyword query for the FTS fallback.
const toFtsQuery = (patterns: string[]): string =>
    patterns
        .join(' ')
        .replace(/[|()\\^$.*+?[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const rankFtsFields = (fields: FtsFieldMatch[]): FtsFieldMatch[] =>
    [...fields].sort(
        (a, b) =>
            (b.verifiedChartUsage ?? 0) - (a.verifiedChartUsage ?? 0) ||
            (b.chartUsage ?? 0) - (a.chartUsage ?? 0) ||
            (b.searchRank ?? 0) - (a.searchRank ?? 0),
    );

const renderFtsFallback = (fields: FtsFieldMatch[]): string => {
    const lines = rankFtsFields(fields)
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
const localityScore = (entry: FieldEntry, matches: MatchFn): number => {
    if (matches(entry.nameHaystack)) return 3;
    if (matches(entry.descHaystack)) return 2;
    if (matches(entry.hintHaystack)) return 1;
    return 0;
};

const localityLabel = (
    entry: FieldEntry,
    matches: MatchFn,
): GrepFieldsResult['patterns'][number]['resultsByExplore'][number]['fields'][number]['matchLocality'] => {
    const score = localityScore(entry, matches);
    switch (score) {
        case 3:
            return 'name';
        case 2:
            return 'description';
        default:
            return 'hint';
    }
};

const getOrderedHits = (hits: FieldEntry[], matches: MatchFn): FieldEntry[] =>
    [...hits].sort(
        (a, b) =>
            localityScore(b, matches) - localityScore(a, matches) ||
            b.verifiedUsage - a.verifiedUsage,
    );

const getFieldIdFromEntry = (entry: FieldEntry): string =>
    entry.path.split('/')[1] ?? entry.path;

const groupOrderedHitsByExplore = (
    orderedHits: FieldEntry[],
    matches: MatchFn,
    requiredFiltersByExplore: Map<
        string,
        GrepFieldsResult['patterns'][number]['resultsByExplore'][number]['requiredFilters']
    >,
): GrepFieldsResult['patterns'][number]['resultsByExplore'] => {
    const byExplore = new Map<string, FieldEntry[]>();
    for (const hit of orderedHits.slice(0, MAX_PER_PATTERN)) {
        const list = byExplore.get(hit.exploreName) ?? [];
        list.push(hit);
        byExplore.set(hit.exploreName, list);
    }

    return [...byExplore.entries()].map(([exploreName, fields]) => ({
        exploreName,
        exploreLabel: fields[0]?.exploreLabel ?? exploreName,
        requiredFilters: requiredFiltersByExplore.get(exploreName) ?? [],
        fields: fields.map((field) => ({
            exploreName: field.exploreName,
            exploreLabel: field.exploreLabel,
            fieldId: getFieldIdFromEntry(field),
            path: field.path,
            kind: field.kind,
            fieldType: field.type,
            label: field.label,
            description: field.description || null,
            hint: field.aiHint || null,
            usageInVerifiedCharts: field.verifiedUsage,
            matchLocality: localityLabel(field, matches),
        })),
    }));
};

const renderHits = (
    hits: FieldEntry[],
    matches: MatchFn,
    requiredFiltersSummaryByExplore: Map<string, string>,
    requiredFiltersByExplore: Map<
        string,
        GrepFieldsResult['patterns'][number]['resultsByExplore'][number]['requiredFilters']
    >,
): string =>
    groupOrderedHitsByExplore(
        getOrderedHits(hits, matches),
        matches,
        requiredFiltersByExplore,
    )
        .map(({ exploreName, exploreLabel, fields }) => {
            const lines = fields
                .map((field) => {
                    const verified =
                        field.usageInVerifiedCharts > 0 ? ' ✓verified' : '';
                    const desc = field.description
                        ? ` — ${field.description
                              .replace(/\s+/g, ' ')
                              .slice(0, 160)}`
                        : '';
                    const hint = field.hint
                        ? ` (hint: ${field.hint
                              .replace(/\s+/g, ' ')
                              .slice(0, 160)})`
                        : '';
                    return `  ${field.path}  [${field.kind} ${field.fieldType}]${verified} ${field.label}${desc}${hint}`;
                })
                .join('\n');
            const header = `  ${exploreName} (${exploreLabel})`;
            const requiredFiltersSummary =
                requiredFiltersSummaryByExplore.get(exploreName);
            return requiredFiltersSummary
                ? `${header}\n  ${requiredFiltersSummary}\n${lines}`
                : `${header}\n${lines}`;
        })
        .join('\n');

const getExplorePointers = (
    exploreHits: ExploreEntry[],
    fieldHits: FieldEntry[],
): Array<{ exploreName: string; exploreLabel: string }> => {
    const coveredExplores = new Set(fieldHits.map((h) => h.exploreName));
    return exploreHits
        .filter((entry) => !coveredExplores.has(entry.exploreName))
        .slice(0, 8)
        .map((entry) => ({
            exploreName: entry.exploreName,
            exploreLabel: entry.exploreLabel,
        }));
};

const renderExplorePointers = (
    pointers: Array<{ exploreName: string; exploreLabel: string }>,
): string | null => {
    if (pointers.length === 0) return null;
    const names = pointers
        .map((pointer) => `${pointer.exploreName} (${pointer.exploreLabel})`)
        .join(', ');
    return `  explores whose name/label/hint match: ${names} — grep within one (exploreName) or call getMetadata.`;
};

// One block per pattern so the agent sees which angle matched what.
const renderPattern = (
    pattern: string,
    hits: FieldEntry[],
    exploreHits: ExploreEntry[],
    matches: MatchFn,
    scopeSize: number,
    requiredFiltersSummaryByExplore: Map<string, string>,
    requiredFiltersByExplore: Map<
        string,
        GrepFieldsResult['patterns'][number]['resultsByExplore'][number]['requiredFilters']
    >,
): {
    text: string;
    isSignal: boolean;
    structuredContent: GrepFieldsResult['patterns'][number];
} => {
    const matchedAllFields = scopeSize > 0 && hits.length === scopeSize;
    if (hits.length === scopeSize && scopeSize >= ALL_MATCH_NO_SIGNAL_MIN) {
        const note = `Matched all ${hits.length} fields in scope, so it carries no signal. Use more specific terms.`;
        return {
            text: `/${pattern}/ — ${note}`,
            isSignal: false,
            structuredContent: {
                pattern,
                status: 'no_signal',
                matchCount: hits.length,
                scopeSize,
                matchedAllFields,
                note,
                resultsByExplore: [],
                metricAmbiguityNote: null,
                matchingExploresByName: [],
            },
        };
    }

    const explorePointers = getExplorePointers(exploreHits, hits);
    const explorePointersText = renderExplorePointers(explorePointers);
    if (hits.length === 0) {
        const note =
            explorePointers.length > 0
                ? 'No direct field matches, but some explore names/labels/hints matched.'
                : 'No matches.';
        return {
            text:
                explorePointersText !== null
                    ? `/${pattern}/ — no direct field matches.\n${explorePointersText}`
                    : `/${pattern}/ — no matches.`,
            isSignal: explorePointers.length > 0,
            structuredContent: {
                pattern,
                status: 'no_matches',
                matchCount: 0,
                scopeSize,
                matchedAllFields,
                note,
                resultsByExplore: [],
                metricAmbiguityNote: null,
                matchingExploresByName: explorePointers,
            },
        };
    }

    const capped =
        hits.length > MAX_PER_PATTERN
            ? ` (showing ${MAX_PER_PATTERN} of ${hits.length})`
            : '';
    const body = renderHits(
        hits,
        matches,
        requiredFiltersSummaryByExplore,
        requiredFiltersByExplore,
    );
    const ambiguityNote = buildMetricAmbiguityNote(hits);
    const extras = [ambiguityNote, explorePointersText]
        .filter(Boolean)
        .map((line) => `\n${line}`)
        .join('');
    const note = `Matched ${hits.length} field${hits.length === 1 ? '' : 's'}${capped}.`;
    return {
        text: `/${pattern}/ — ${hits.length} match${
            hits.length === 1 ? '' : 'es'
        }${capped}:\n${body}${extras}`,
        isSignal: true,
        structuredContent: {
            pattern,
            status: 'matches',
            matchCount: hits.length,
            scopeSize,
            matchedAllFields,
            note,
            resultsByExplore: groupOrderedHitsByExplore(
                getOrderedHits(hits, matches),
                matches,
                requiredFiltersByExplore,
            ),
            metricAmbiguityNote: ambiguityNote,
            matchingExploresByName: explorePointers,
        },
    };
};

const buildStructuredFuzzyMatches = (
    fields: FtsFieldMatch[],
): GrepFieldsResult['fuzzyMatches'] =>
    rankFtsFields(fields).map((field) => ({
        exploreName: field.tableName,
        fieldId: `${field.tableName}_${field.name}`,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description ?? null,
        searchRank: field.searchRank ?? null,
        usageInCharts: field.chartUsage ?? 0,
        usageInVerifiedCharts: field.verifiedChartUsage ?? 0,
    }));

export const executeGrepFields = async (
    { patterns, exploreName }: ToolGrepFieldsArgs,
    { availableExplores, findExplores, verifiedFieldUsage }: Dependencies,
): Promise<ExecuteStructuredToolResult<GrepFieldsResult>> => {
    const index = buildFieldIndex(availableExplores, verifiedFieldUsage);
    const scoped = exploreName
        ? index.filter((entry) => entry.exploreName === exploreName)
        : index;
    // When already scoped to one explore, explore-level pointers add nothing —
    // the caller is already inside that explore.
    const scopedExplores = exploreName
        ? []
        : buildExploreIndex(availableExplores);

    const requiredFiltersSummaryByExplore = new Map<string, string>();
    const requiredFiltersByExplore = new Map<
        string,
        GrepFieldsResult['patterns'][number]['resultsByExplore'][number]['requiredFilters']
    >();
    for (const explore of availableExplores) {
        const summary = summarizeRequiredFilters(explore);
        if (summary) {
            requiredFiltersSummaryByExplore.set(explore.name, summary);
        }
        requiredFiltersByExplore.set(
            explore.name,
            getExploreRequiredFilters(explore),
        );
    }

    // Each pattern is matched against the whole (pre-filtered) index in one
    // pass — "parallel" greps without an extra round-trip.
    const perPattern = patterns.map((pattern) => {
        const matches = compileMatcher(pattern);
        const hits = scoped.filter((entry) => matches(entry.haystack));
        const exploreHits = scopedExplores.filter((entry) =>
            matches(entry.haystack),
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
                requiredFiltersSummaryByExplore,
                requiredFiltersByExplore,
            ),
        };
    });
    const blocks = perPattern.map((patternResult) => patternResult.block);

    // Persisted with the tool result: makes grep quality observable in
    // production. matchedAllFields is the fingerprint of a too-broad or broken
    // grep.
    const patternStats = perPattern.map((patternResult) => ({
        pattern: patternResult.pattern,
        matchCount: patternResult.hits.length,
        scopeSize: scoped.length,
        matchedAllFields:
            scoped.length > 0 && patternResult.hits.length === scoped.length,
    }));
    if (patternStats.some((stat) => stat.matchedAllFields)) {
        Logger.warn('grepFields pattern matched all fields', {
            patterns,
            exploreName,
            scopeSize: scoped.length,
        });
    }

    // FTS (stemming + recall) runs on EVERY grep, not just dry ones: a grep
    // that "succeeds" with plausible-but-wrong hits would otherwise suppress
    // the search mode that finds what the literal grep missed. Failures degrade
    // to grep-only results.
    let ftsFields: FtsFieldMatch[] = [];
    try {
        const scopedFieldIds = new Set(
            scoped.map((field) => getFieldIdFromEntry(field)),
        );
        const fts = await findExplores({
            fieldSearchSize: 25,
            searchQuery: toFtsQuery(patterns),
        });
        ftsFields = (fts.topMatchingFields ?? []).filter(
            (field) =>
                !exploreName ||
                scopedFieldIds.has(`${field.tableName}_${field.name}`),
        );
    } catch {
        ftsFields = [];
    }

    const blocksText = blocks.map((block) => block.text).join('\n\n');
    const anyHit = blocks.some((block) => block.isSignal);

    if (anyHit) {
        // Cross-check: append only FTS fields the grep did not already surface,
        // so stemmed matches aren't lost without duplicating what the caller can
        // already see.
        const greppedFieldIds = new Set(
            perPattern.flatMap((patternResult) =>
                patternResult.hits.map((hit) => getFieldIdFromEntry(hit)),
            ),
        );
        const novelFtsFields = ftsFields.filter(
            (field) => !greppedFieldIds.has(`${field.tableName}_${field.name}`),
        );
        const crossCheck =
            novelFtsFields.length > 0
                ? `\n\nCatalog fuzzy search also matches (not in the grep results above):\n${novelFtsFields
                      .slice(0, 8)
                      .map(
                          (field) =>
                              `  ${field.tableName}_${field.name}  [${field.fieldType}] ${field.label}`,
                      )
                      .join('\n')}`
                : '';

        return {
            result: `${blocksText}${crossCheck}`,
            metadata: { status: 'success', patternStats },
            structuredContent: {
                description:
                    'Deterministic keyword grep over the scoped explore catalog. `patterns` shows direct matches grouped by explore; `fuzzyMatches` is the catalog-search cross-check for additional near matches not already surfaced by grep.',
                exploreName,
                patterns: blocks.map((block) => block.structuredContent),
                fuzzyMatches: buildStructuredFuzzyMatches(novelFtsFields),
            },
        };
    }

    const scope = exploreName ? ` in explore "${exploreName}"` : '';
    // Keep the per-pattern diagnosis (e.g. "matched all N fields") in front of
    // the fallback so the caller knows WHY grep is dry.
    return {
        result:
            ftsFields.length > 0
                ? `${blocksText}\n\n${renderFtsFallback(ftsFields)}`
                : `${blocksText}\n\nNo fields matched any of the patterns${scope}, and the catalog search found nothing close. Try broader or alternative keywords.`,
        metadata: { status: 'success', patternStats },
        structuredContent: {
            description:
                'Deterministic keyword grep over the scoped explore catalog. `patterns` shows direct matches grouped by explore; when direct matches are absent, `fuzzyMatches` contains the closest catalog-search suggestions.',
            exploreName,
            patterns: blocks.map((block) => block.structuredContent),
            fuzzyMatches: buildStructuredFuzzyMatches(ftsFields),
        },
    };
};

/**
 * Deterministic field discovery: grep an in-memory, annotated view of the
 * project's compiled explores (explore = directory, field = file). Reads only
 * the cached explores passed in, so it works for every connection type and
 * never touches the warehouse or git. Gated by the `ai-grep-fields` flag as an
 * alternative to the discoverFields sub-agent.
 */
export const getGrepFields = (dependencies: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const result = await executeGrepFields(args, dependencies);
                return {
                    result: result.result,
                    metadata: result.metadata,
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error grepping fields'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
