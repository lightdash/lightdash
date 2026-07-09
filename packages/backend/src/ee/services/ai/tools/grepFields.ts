import {
    grepFieldsToolDefinition,
    type Explore,
    type FindExploresRequiredFilter,
    type GrepFieldsResult,
    type ToolGrepFieldsArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    buildExploreIndex,
    buildFieldIndex,
    buildMetricAmbiguityNote,
    compileMatcher,
    MATCH_LOCALITY_RANK,
    matchLocality,
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

type GrepFieldsPatternStats = {
    pattern: string;
    matchCount: number;
    scopeSize: number;
    matchedAllFields: boolean;
}[];

type GrepFieldsExecuteResult = ExecuteStructuredToolResult<
    GrepFieldsResult,
    { status: 'success'; patternStats: GrepFieldsPatternStats }
>;

// The scoped, pre-built view of the catalog a grep runs against. Built once per
// tool instance so repeated grep calls in one agent run don't re-flatten and
// re-lowercase every field (see buildGrepFieldsContext / getGrepFields).
type GrepFieldsContext = {
    index: FieldEntry[];
    exploreIndex: ExploreEntry[];
    exploreNames: Set<string>;
    requiredFiltersSummaryByExplore: Map<string, string>;
    requiredFiltersByExplore: Map<string, FindExploresRequiredFilter[]>;
};

// Turn the regex patterns into a plain-keyword query, used for the FTS
// fallback and as the search text for verified-answer relevance lookups.
export const grepPatternsToSearchQuery = (patterns: string[]): string =>
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

// Rank by where the pattern matched, most-specific first (name/label beats
// description beats hint), then by verified usage. Keeps a name-matching field
// visible above the display cap even when many popular fields match loosely.
const localityRank = (entry: FieldEntry, matches: MatchFn): number =>
    MATCH_LOCALITY_RANK[matchLocality(entry, matches)];

const getOrderedHits = (hits: FieldEntry[], matches: MatchFn): FieldEntry[] =>
    [...hits].sort(
        (a, b) =>
            localityRank(b, matches) - localityRank(a, matches) ||
            b.verifiedUsage - a.verifiedUsage,
    );

const getFieldIdFromEntry = (entry: FieldEntry): string =>
    entry.path.split('/')[1] ?? entry.path;

type ResultsByExplore =
    GrepFieldsResult['patterns'][number]['resultsByExplore'];

const groupOrderedHitsByExplore = (
    orderedHits: FieldEntry[],
    matches: MatchFn,
    requiredFiltersByExplore: Map<string, FindExploresRequiredFilter[]>,
): ResultsByExplore => {
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
            matchLocality: matchLocality(field, matches),
        })),
    }));
};

// Render the human-readable block from the already-grouped results, so the text
// and the structuredContent are two views of one computation, not two passes.
const renderGroupedHits = (
    resultsByExplore: ResultsByExplore,
    requiredFiltersSummaryByExplore: Map<string, string>,
): string =>
    resultsByExplore
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
    requiredFiltersByExplore: Map<string, FindExploresRequiredFilter[]>,
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

    // Group once and derive both the text block and the structuredContent from
    // it, so a future ordering/capping change can't make the two disagree.
    const resultsByExplore = groupOrderedHitsByExplore(
        getOrderedHits(hits, matches),
        matches,
        requiredFiltersByExplore,
    );
    const capped =
        hits.length > MAX_PER_PATTERN
            ? ` (showing ${MAX_PER_PATTERN} of ${hits.length})`
            : '';
    const body = renderGroupedHits(
        resultsByExplore,
        requiredFiltersSummaryByExplore,
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
            resultsByExplore,
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

// Flatten the catalog into the greppable index and required-filter maps once, so
// callers that reuse the context (the agent tool instance) don't rebuild them on
// every grep call.
const buildGrepFieldsContext = ({
    availableExplores,
    verifiedFieldUsage,
}: Pick<
    Dependencies,
    'availableExplores' | 'verifiedFieldUsage'
>): GrepFieldsContext => {
    const requiredFiltersSummaryByExplore = new Map<string, string>();
    const requiredFiltersByExplore = new Map<
        string,
        FindExploresRequiredFilter[]
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
    return {
        index: buildFieldIndex(availableExplores, verifiedFieldUsage),
        exploreIndex: buildExploreIndex(availableExplores),
        exploreNames: new Set(availableExplores.map((explore) => explore.name)),
        requiredFiltersSummaryByExplore,
        requiredFiltersByExplore,
    };
};

const runGrepFields = async (
    { patterns, exploreName }: ToolGrepFieldsArgs,
    context: GrepFieldsContext,
    findExplores: FindExploresFn,
): Promise<GrepFieldsExecuteResult> => {
    // A typo'd or out-of-scope explore name would otherwise scope to zero
    // fields and report "no matches, try broader keywords" — steering the caller
    // to retry patterns inside an explore that does not exist. Report it as what
    // it is, and list the valid explores so the caller can correct the name.
    if (exploreName && !context.exploreNames.has(exploreName)) {
        const available = [...context.exploreNames];
        const message = `Explore "${exploreName}" not found or not available to this agent. ${
            available.length > 0
                ? `Available explores: ${available.join(', ')}.`
                : 'No explores are available.'
        } Omit exploreName to search all explores.`;
        return {
            result: message,
            metadata: { status: 'success', patternStats: [] },
            structuredContent: {
                description: message,
                exploreName,
                patterns: [],
                fuzzyMatches: [],
            },
        };
    }

    const scoped = exploreName
        ? context.index.filter((entry) => entry.exploreName === exploreName)
        : context.index;
    // When already scoped to one explore, explore-level pointers add nothing —
    // the caller is already inside that explore.
    const scopedExplores = exploreName ? [] : context.exploreIndex;
    const { requiredFiltersSummaryByExplore, requiredFiltersByExplore } =
        context;

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
            searchQuery: grepPatternsToSearchQuery(patterns),
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
        const novelFtsFields = rankFtsFields(
            ftsFields.filter(
                (field) =>
                    !greppedFieldIds.has(`${field.tableName}_${field.name}`),
            ),
        ).slice(0, 8);
        const crossCheck =
            novelFtsFields.length > 0
                ? `\n\nCatalog fuzzy search also matches (not in the grep results above):\n${novelFtsFields
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

export const executeGrepFields = async (
    args: ToolGrepFieldsArgs,
    { availableExplores, findExplores, verifiedFieldUsage }: Dependencies,
): Promise<GrepFieldsExecuteResult> =>
    runGrepFields(
        args,
        buildGrepFieldsContext({ availableExplores, verifiedFieldUsage }),
        findExplores,
    );

/**
 * Deterministic field discovery: grep an in-memory, annotated view of the
 * project's compiled explores (explore = directory, field = file). Reads only
 * the cached explores passed in, so it works for every connection type and
 * never touches the warehouse or git. Gated by the `ai-grep-fields` flag as an
 * alternative to the discoverFields sub-agent.
 */
export const getGrepFields = (dependencies: Dependencies) => {
    // The tool instance persists across every grep call in an agent run, so the
    // greppable index is built once here rather than per call.
    const context = buildGrepFieldsContext(dependencies);
    return tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const result = await runGrepFields(
                    args,
                    context,
                    dependencies.findExplores,
                );
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
};
