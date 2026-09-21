import {
    grepFieldsToolDefinition,
    type Explore,
    type FindExploresRequiredFilter,
    type GrepFieldsResult,
    type ParameterDefinitions,
    type ToolGrepFieldsArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import Logger from '../../../../logging/logger';
import type { AgentDecisionContext } from '../decisions/agentQuestion';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import { prepareCatalogMetadata } from '../decisions/catalogMetadata';
import {
    CATALOG_AMBIGUITY_GUIDANCE,
    CATALOG_TIME_AMBIGUITY_GUIDANCE,
    rankCatalog,
} from '../decisions/catalogRanking';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import type { ExecuteStructuredToolResult } from '../utils/structuredToolResult';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { truncate } from '../utils/truncation';
import {
    buildMetricAmbiguityNote,
    compileMatcher,
    getCachedExploreIndex,
    getCachedFieldIndex,
    MATCH_LOCALITY_RANK,
    matchLocality,
    summarizeRequiredFilters,
    type ExploreEntry,
    type FieldEntry,
} from './grepFieldsIndex';

const toolDefinition = grepFieldsToolDefinition.for('agent');

type Dependencies = {
    decisions?: AiDecisionClient;
    userQuestion?: string;
    conversation?: AgentDecisionContext;
    projectParameterDefinitions?: ParameterDefinitions;
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
    availableExplores: Explore[];
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

const ANNOTATION_PREVIEW_CHARS = 160;
const FTS_ANNOTATION_PREVIEW_CHARS = 140;

// Per-call ceiling (~5k tokens) for rendering top matches' hints in full;
// catalogs whose annotations fit the preview spend none of it.
const UPGRADE_BUDGET_CHARS = 20_000;

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ');

// An upgraded field renders full text only at its first occurrence.
type RenderState = {
    upgradedPaths: Set<string>;
    renderedFullPaths: Set<string>;
};

const renderAnnotation = (
    text: string,
    options: { full: boolean; previewChars?: number },
): string => {
    const collapsed = collapseWhitespace(text);
    if (options.full) return collapsed;
    return truncate(
        collapsed,
        options.previewChars ?? ANNOTATION_PREVIEW_CHARS,
    );
};

const renderFtsFallback = (fields: FtsFieldMatch[], ranked = false): string => {
    const lines = fields
        .map((f) => {
            const verified = f.verifiedChartUsage ? ' ✓verified' : '';
            const desc = f.description
                ? ` — ${renderAnnotation(f.description, {
                      full: false,
                      previewChars: FTS_ANNOTATION_PREVIEW_CHARS,
                  })}`
                : '';
            return `  ${f.tableName}_${f.name}  [${f.fieldType}]${verified} ${f.label}${desc}`;
        })
        .join('\n');
    return `No exact grep matches. Closest catalog matches (${ranked ? 'fuzzy search' : 'fuzzy search, verified fields first'}):\n${lines}`;
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

const getOrderedHits = (
    hits: FieldEntry[],
    matches: MatchFn,
    ranks?: Map<string, number>,
): FieldEntry[] =>
    [...hits].sort(
        (a, b) =>
            (ranks
                ? (ranks.get(a.path) ?? Infinity) -
                  (ranks.get(b.path) ?? Infinity)
                : 0) ||
            localityRank(b, matches) - localityRank(a, matches) ||
            b.verifiedUsage - a.verifiedUsage,
    );

const isNoSignalPattern = (hitCount: number, scopeSize: number): boolean =>
    hitCount === scopeSize && scopeSize >= ALL_MATCH_NO_SIGNAL_MIN;

const upgradeCost = (entry: FieldEntry): number =>
    Math.max(
        0,
        collapseWhitespace(entry.description).length - ANNOTATION_PREVIEW_CHARS,
    ) +
    Math.max(
        0,
        collapseWhitespace(entry.aiHint).length - ANNOTATION_PREVIEW_CHARS,
    );

// Best matches first (locality, then verified usage) until the budget runs out.
const pickFieldsWorthFullHints = (
    displayedPerPattern: { displayed: FieldEntry[]; matches: MatchFn }[],
): Set<string> => {
    const candidates = new Map<string, { entry: FieldEntry; rank: number }>();
    for (const { displayed, matches } of displayedPerPattern) {
        for (const entry of displayed) {
            const rank = localityRank(entry, matches);
            const current = candidates.get(entry.path);
            if (!current || rank > current.rank) {
                candidates.set(entry.path, { entry, rank });
            }
        }
    }

    const ranked = [...candidates.values()].sort(
        (a, b) =>
            b.rank - a.rank || b.entry.verifiedUsage - a.entry.verifiedUsage,
    );
    const upgraded = new Set<string>();
    let remaining = UPGRADE_BUDGET_CHARS;
    for (const { entry } of ranked) {
        const cost = upgradeCost(entry);
        // Skip what doesn't fit; a cheaper field may still.
        if (cost > 0 && cost <= remaining) {
            upgraded.add(entry.path);
            remaining -= cost;
        }
    }
    return upgraded;
};

const getFieldIdFromEntry = (entry: FieldEntry): string =>
    entry.path.split('/')[1] ?? entry.path;

type ResultsByExplore =
    GrepFieldsResult['patterns'][number]['resultsByExplore'];

const groupOrderedHitsByExplore = (
    orderedHits: FieldEntry[],
    matches: MatchFn,
    requiredFiltersByExplore: Map<string, FindExploresRequiredFilter[]>,
    exploreRanks?: Map<string, number>,
): ResultsByExplore => {
    const byExplore = new Map<string, FieldEntry[]>();
    for (const hit of orderedHits.slice(0, MAX_PER_PATTERN)) {
        const list = byExplore.get(hit.exploreName) ?? [];
        list.push(hit);
        byExplore.set(hit.exploreName, list);
    }

    const groups = [...byExplore.entries()];
    if (exploreRanks)
        groups.sort(
            (a, b) =>
                (exploreRanks.get(a[0]) ?? Infinity) -
                (exploreRanks.get(b[0]) ?? Infinity),
        );
    return groups.map(([exploreName, fields]) => ({
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
            defaultTimeDimension: field.defaultTimeDimension,
            defaultTimeDimensionGranularity:
                field.defaultTimeDimensionGranularity,
            requiredParameters: field.requiredParameters,
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
    state: RenderState,
): string =>
    resultsByExplore
        .map(({ exploreName, exploreLabel, fields }) => {
            const lines = fields
                .map((field) => {
                    const verified =
                        field.usageInVerifiedCharts > 0 ? ' ✓verified' : '';
                    const full =
                        state.upgradedPaths.has(field.path) &&
                        !state.renderedFullPaths.has(field.path);
                    if (full) state.renderedFullPaths.add(field.path);
                    const desc = field.description
                        ? ` — ${renderAnnotation(field.description, { full })}`
                        : '';
                    const hint = field.hint
                        ? ` (hint: ${renderAnnotation(field.hint, { full })})`
                        : '';
                    const defaultTimeDimension = field.defaultTimeDimension
                        ? ` default_time_dimension: ${field.defaultTimeDimension} default_time_dimension_granularity: ${field.defaultTimeDimensionGranularity}`
                        : '';
                    const params =
                        field.requiredParameters.length > 0
                            ? ` ⚠params: ${field.requiredParameters.join(',')}`
                            : '';
                    return `  ${field.path}  [${field.kind} ${field.fieldType}]${verified}${params} ${field.label}${defaultTimeDimension}${desc}${hint}`;
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
    state: RenderState,
    fieldRanks?: Map<string, number>,
    exploreRanks?: Map<string, number>,
): {
    text: string;
    isSignal: boolean;
    structuredContent: GrepFieldsResult['patterns'][number];
} => {
    const matchedAllFields = scopeSize > 0 && hits.length === scopeSize;
    if (isNoSignalPattern(hits.length, scopeSize)) {
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
        getOrderedHits(hits, matches, fieldRanks),
        matches,
        requiredFiltersByExplore,
        exploreRanks,
    );
    const capped =
        hits.length > MAX_PER_PATTERN
            ? ` (showing ${MAX_PER_PATTERN} of ${hits.length})`
            : '';
    const body = renderGroupedHits(
        resultsByExplore,
        requiredFiltersSummaryByExplore,
        state,
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
    fields.map((field) => ({
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
        availableExplores,
        index: getCachedFieldIndex(availableExplores, verifiedFieldUsage),
        exploreIndex: getCachedExploreIndex(availableExplores),
        exploreNames: new Set(availableExplores.map((explore) => explore.name)),
        requiredFiltersSummaryByExplore,
        requiredFiltersByExplore,
    };
};

const runGrepFields = async (
    { patterns, exploreName }: ToolGrepFieldsArgs,
    context: GrepFieldsContext,
    findExplores: FindExploresFn,
    ranking?: Pick<
        Dependencies,
        | 'decisions'
        | 'userQuestion'
        | 'conversation'
        | 'projectParameterDefinitions'
    >,
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
    const matched = patterns.map((pattern) => {
        const matches = compileMatcher(pattern);
        const hits = scoped.filter((entry) => matches(entry.haystack));
        const exploreHits = scopedExplores.filter((entry) =>
            matches(entry.haystack),
        );
        return { pattern, matches, hits, exploreHits };
    });

    // FTS (stemming + recall) runs on EVERY grep, not just dry ones: a grep
    // that "succeeds" with plausible-but-wrong hits would otherwise suppress
    // the search mode that finds what the literal grep missed. Failures degrade
    // to grep-only results.
    let ftsFields = rankFtsFields(
        await (async (): Promise<FtsFieldMatch[]> => {
            try {
                const scopedFieldIds = new Set(
                    scoped.map((field) => getFieldIdFromEntry(field)),
                );
                const fts = await findExplores({
                    fieldSearchSize: 25,
                    searchQuery: grepPatternsToSearchQuery(patterns),
                });
                return (fts.topMatchingFields ?? []).filter(
                    (field) =>
                        (!exploreName && !ranking?.decisions) ||
                        scopedFieldIds.has(`${field.tableName}_${field.name}`),
                );
            } catch {
                return [];
            }
        })(),
    );

    const getRankingPool = (): FieldEntry[] => {
        const direct = matched.flatMap(({ hits, matches }) =>
            isNoSignalPattern(hits.length, scoped.length)
                ? []
                : getOrderedHits(hits, matches),
        );
        const byId = new Map<string, FieldEntry[]>();
        scoped.forEach((field) => {
            const id = getFieldIdFromEntry(field);
            byId.set(id, [...(byId.get(id) ?? []), field]);
        });
        const fuzzy = ftsFields.flatMap(
            (field) => byId.get(`${field.tableName}_${field.name}`) ?? [],
        );
        // Reserve room for fuzzy recall inside the 40-field decision budget.
        return [
            ...new Map(
                [
                    ...direct.slice(0, 32),
                    ...fuzzy.slice(0, 8),
                    ...direct.slice(32),
                    ...fuzzy.slice(8),
                ].map((field) => [field.path, field]),
            ).values(),
        ];
    };
    const ranked = ranking?.decisions
        ? await rankCatalog({
              decisions: ranking.decisions,
              conversation: ranking.conversation,
              query: [
                  ranking.userQuestion,
                  `Catalog search: ${grepPatternsToSearchQuery(patterns)}`,
              ]
                  .filter(Boolean)
                  .join('\n'),
              fields: getRankingPool(),
              explores: exploreName
                  ? context.availableExplores.filter(
                        (explore) => explore.name === exploreName,
                    )
                  : context.availableExplores,
          })
        : null;
    const fieldRanks = ranked?.fieldRanks ?? undefined;
    const exploreRanks = ranked?.exploreRanks ?? undefined;
    if (exploreRanks)
        matched.forEach(({ exploreHits }) =>
            exploreHits.sort(
                (a, b) =>
                    (exploreRanks.get(a.exploreName) ?? Infinity) -
                    (exploreRanks.get(b.exploreName) ?? Infinity),
            ),
        );

    const state: RenderState = {
        upgradedPaths: pickFieldsWorthFullHints(
            matched
                .filter(
                    ({ hits }) =>
                        hits.length > 0 &&
                        !isNoSignalPattern(hits.length, scoped.length),
                )
                .map(({ hits, matches }) => ({
                    displayed: getOrderedHits(hits, matches, fieldRanks).slice(
                        0,
                        MAX_PER_PATTERN,
                    ),
                    matches,
                })),
        ),
        renderedFullPaths: new Set(),
    };

    const perPattern = matched.map(
        ({ pattern, matches, hits, exploreHits }) => ({
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
                state,
                fieldRanks,
                exploreRanks,
            ),
        }),
    );
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

    if (ranked?.fieldsRanked) {
        const fuzzyRanks = new Map<string, number>();
        ranked.fields.forEach((field) => {
            const id = getFieldIdFromEntry(field);
            const rank = ranked.fieldRanks?.get(field.path) ?? Infinity;
            fuzzyRanks.set(id, Math.min(fuzzyRanks.get(id) ?? Infinity, rank));
        });
        ftsFields = [...ftsFields].sort(
            (a, b) =>
                (fuzzyRanks.get(`${a.tableName}_${a.name}`) ?? Infinity) -
                (fuzzyRanks.get(`${b.tableName}_${b.name}`) ?? Infinity),
        );
    }

    const blocksText = [
        blocks.map((block) => block.text).join('\n\n'),
        ranked && ranking?.projectParameterDefinitions
            ? prepareCatalogMetadata(
                  ranked.fields,
                  context.availableExplores,
                  ranking.projectParameterDefinitions,
                  ranked.fieldRanks,
                  ranked.exploreRanks,
              )
            : null,
        ranked?.ambiguous ? CATALOG_AMBIGUITY_GUIDANCE : null,
        ranked?.timeAmbiguous ? CATALOG_TIME_AMBIGUITY_GUIDANCE : null,
    ]
        .filter(Boolean)
        .join('\n\n');
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
        const novelFtsFields = ftsFields
            .filter(
                (field) =>
                    !greppedFieldIds.has(`${field.tableName}_${field.name}`),
            )
            .slice(0, 8);
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
                ? `${blocksText}\n\n${renderFtsFallback(ftsFields, ranked?.fieldsRanked)}`
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
    {
        availableExplores,
        findExplores,
        verifiedFieldUsage,
        decisions,
        userQuestion,
        conversation,
        projectParameterDefinitions,
    }: Dependencies,
): Promise<GrepFieldsExecuteResult> =>
    runGrepFields(
        args,
        buildGrepFieldsContext({ availableExplores, verifiedFieldUsage }),
        findExplores,
        { decisions, userQuestion, conversation, projectParameterDefinitions },
    );

/**
 * Deterministic field discovery: grep an in-memory, annotated view of the
 * project's compiled explores (explore = directory, field = file). Reads only
 * the cached explores passed in, so it works for every connection type and
 * never touches the warehouse or git.
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
                    dependencies,
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
