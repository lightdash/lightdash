import {
    FilterOperator,
    getFields,
    getItemId,
    getTotalFilterRules,
    type Explore,
    type MetricQuery,
    type ParametersValuesMap,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import type { AgentDecisionContext } from './agentQuestion';
import {
    AiDecisionClient,
    decisionProbability,
    type DecisionQuestion,
} from './AiDecisionClient';
import { prepareDateCheck } from './dateChecks';
import { resolveFieldValue } from './fieldValues';
import { prepareRankingCheck } from './rankingChecks';

export const QUERY_INTENT_CHECKS = {
    measure: [
        'Is the selected metric clearly a different measure from the one explicitly requested?',
        'Check the requested measure against the selected metric definitions.',
    ],
    conditions: [
        'Is an explicit condition in the request missing from the query and from the selected metric definitions? A condition encoded in metric SQL or required table filters is already represented.',
        'Represent every explicit condition as a filter or a metric definition; grouping alone does not apply a filter.',
    ],
    grain: [
        'Does the chosen explore or query clearly aggregate at a different entity or grouping than explicitly requested? Inspect the base table, selected dimensions, metric definitions and declared join predicates and relationships, including how filters attribute activity to an entity. Do not assume the presence of a joined field makes the base table the correct grain.',
        'Check entity grain, requested groupings and join relationships.',
    ],
    time: [
        'Does the query use a different named time field or time granularity from the one explicitly requested? Do not calculate or compare date values.',
        'Check the requested time field and granularity.',
    ],
    ranking: [
        'Does the query omit or contradict an explicitly requested top or bottom ranking, sort direction, or row limit?',
        'Apply the requested ranking, direction and limit.',
    ],
} as const;

export const QUERY_INTENT_ADVICE_THRESHOLD = 0.9;

export type ReviewableMetricQuery = Pick<
    MetricQuery,
    'exploreName' | 'metrics' | 'dimensions' | 'filters'
> & {
    sorts: (Omit<MetricQuery['sorts'][number], 'nullsFirst'> & {
        nullsFirst?: boolean | null;
    })[];
    limit: number | null;
    parameters?: ParametersValuesMap | null;
    timezone?: string | null;
};

export const describeSemanticQuery = (
    query: ReviewableMetricQuery,
    explore: Explore,
) => {
    const selected = new Set([
        ...query.metrics,
        ...query.dimensions,
        ...getTotalFilterRules(query.filters).map(
            (filter) => filter.target.fieldId,
        ),
    ]);
    return {
        query,
        explore: {
            name: explore.name,
            baseTable: explore.baseTable,
            description: explore.tables[explore.baseTable]?.description,
            joins: explore.joinedTables.map((join) => ({
                table: join.table,
                relationship: join.relationship ?? null,
                type: join.type ?? null,
                sqlOn: join.sqlOn,
                always: join.always ?? false,
            })),
        },
        fields: getFields(explore)
            .filter((field) => selected.has(getItemId(field)))
            .map((field) => ({
                id: getItemId(field),
                table: field.table,
                label: field.label,
                description: field.description,
                type: field.type,
                sql: field.sql,
            })),
        requiredFilters: Object.values(explore.tables).flatMap(
            (table) => table.requiredFilters ?? [],
        ),
        tableSqlFilters: Object.values(explore.tables).flatMap((table) =>
            table.sqlWhere ? [{ table: table.name, sql: table.sqlWhere }] : [],
        ),
    };
};

export const queryReviewNote = (issues: string[]): string =>
    issues.length
        ? ` Query/question review: ${issues.join(' ')} These are possible mismatches, not established errors. Check before treating these rows as the final answer; an intermediate query need not answer the whole question.`
        : '';

export const checkQueryIntent = async ({
    decisions,
    question,
    query,
    explore,
    conversation,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    question: string;
    query: { queryConfig: ReviewableMetricQuery };
    explore: Explore;
    conversation?: AgentDecisionContext;
}): Promise<string[]> => {
    const questions: Record<string, DecisionQuestion> = Object.fromEntries(
        Object.entries(QUERY_INTENT_CHECKS).map(([name, [instructions]]) => [
            name,
            { type: 'noul', instructions },
        ]),
    );
    const dateCheck = prepareDateCheck({ question, conversation, explore });
    const rankingCheck = prepareRankingCheck({
        question,
        conversation,
        explore,
        query: query.queryConfig,
    });
    const answers = await decisions.evaluate({
        operation: 'query-intent',
        state: {
            question,
            conversation,
            ...describeSemanticQuery(query.queryConfig, explore),
        },
        questions: {
            ...questions,
            ...dateCheck?.questions,
            ...rankingCheck?.questions,
        },
    });
    if (!answers) return [];
    const rankingAdvice = rankingCheck?.advice(answers) ?? [];
    const advice = Object.entries(QUERY_INTENT_CHECKS).flatMap(
        ([key, [, hint]]) =>
            !(key === 'ranking' && rankingAdvice.length > 0) &&
            (decisionProbability(answers[key]) ?? 0) >=
                QUERY_INTENT_ADVICE_THRESHOLD
                ? [hint]
                : [],
    );
    return [
        ...advice,
        ...(dateCheck?.advice(answers, query.queryConfig.filters) ?? []),
        ...rankingAdvice,
    ];
};

export const emptyResultGuidance = (
    query: ToolRunQueryArgsTransformed,
): string => {
    const rules = getTotalFilterRules(query.queryConfig.filters);
    const suggestions = [
        'The query returned no rows. This does not establish that any particular filter is wrong.',
        rules.length > 0
            ? 'Check the literal filter values with searchFieldValues and confirm the requested date scope.'
            : 'Check whether the chosen explore has data and whether required table filters apply.',
        query.queryConfig.parameters
            ? 'Verify the explicitly supplied parameter values against the user’s request.'
            : null,
        'Preserve the user’s filters and scope. Do not broaden the query just to obtain rows. If no concrete mismatch is found, report the empty result instead of guessing again.',
    ];
    return suggestions.filter(Boolean).join(' ');
};

export const getEmptyFilterHints = async ({
    decisions,
    query,
    searchFieldValues,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    query: ToolRunQueryArgsTransformed;
    searchFieldValues: SearchFieldValuesFn;
}): Promise<string> => {
    const candidates = getTotalFilterRules(query.queryConfig.filters)
        .filter((filter) => filter.operator === FilterOperator.EQUALS)
        .flatMap((filter) =>
            (filter.values ?? [])
                .filter(
                    (value): value is string =>
                        typeof value === 'string' && value.trim().length > 0,
                )
                .map((value) => ({ fieldId: filter.target.fieldId, value })),
        )
        .slice(0, 2);
    const lookup = Promise.all(
        candidates.map(async ({ fieldId, value }) => {
            try {
                const result = await searchFieldValues({
                    table: query.queryConfig.exploreName,
                    fieldId,
                    query: value,
                });
                const values = Array.isArray(result) ? result : result.results;
                const resolved = await resolveFieldValue({
                    decisions,
                    fieldId,
                    requested: value,
                    values,
                });
                return resolved === null || resolved === value
                    ? null
                    : `For ${fieldId}, ${JSON.stringify(resolved)} is a likely equivalent of ${JSON.stringify(value)} from the available values. Verify it preserves the requested meaning before retrying.`;
            } catch {
                return null;
            }
        }),
    );
    // Value search can hit the warehouse. Bound optional diagnosis as a whole;
    // a slow lookup must not delay reporting a legitimate empty result.
    let timer: NodeJS.Timeout | undefined;
    try {
        const hints = await Promise.race([
            lookup,
            new Promise<null[]>((resolve) => {
                timer = setTimeout(() => resolve([]), 1_000);
            }),
        ]);
        return hints.filter(Boolean).join(' ');
    } finally {
        clearTimeout(timer);
    }
};
