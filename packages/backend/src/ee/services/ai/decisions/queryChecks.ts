import {
    DimensionType,
    FilterOperator,
    getFields,
    getItemId,
    getTotalFilterRules,
    isDimension,
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

export type FilterLiteral = {
    fieldId: string;
    operator: FilterOperator;
    value: string;
};

export type FilterLiteralCheck = FilterLiteral &
    (
        | { outcome: 'found' | 'missing' }
        | { outcome: 'equivalent'; equivalent: string | number | boolean }
    );

export const GROUNDED_FILTER_OPERATORS = [
    FilterOperator.EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.STARTS_WITH,
];

export const getFilterLiterals = (
    filters: MetricQuery['filters'],
    operators: FilterOperator[],
): FilterLiteral[] =>
    getTotalFilterRules(filters)
        .filter((filter) => operators.includes(filter.operator))
        .flatMap((filter) =>
            (filter.values ?? [])
                .filter(
                    (value): value is string =>
                        typeof value === 'string' && value.trim().length > 0,
                )
                .map((value) => ({
                    fieldId: filter.target.fieldId,
                    operator: filter.operator,
                    value,
                })),
        );

/** Case-insensitive for include/startsWith, so a hint never fires on a literal that may match. */
const literalMatches = (
    { operator, value: literal }: FilterLiteral,
    value: string | number | boolean,
): boolean => {
    if (operator === FilterOperator.EQUALS) return value === literal;
    const text = String(value).toLowerCase();
    return operator === FilterOperator.STARTS_WITH
        ? text.startsWith(literal.toLowerCase())
        : text.includes(literal.toLowerCase());
};

const toValues = (result: Awaited<ReturnType<SearchFieldValuesFn>>) =>
    Array.isArray(result) ? result : result.results;

/** Looks a filter literal up in its own field. Throws when the lookup fails. */
export const checkFilterLiteral = async ({
    decisions,
    exploreName,
    literal,
    searchFieldValues,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    exploreName: string;
    literal: FilterLiteral;
    searchFieldValues: SearchFieldValuesFn;
}): Promise<FilterLiteralCheck> => {
    const values = toValues(
        await searchFieldValues({
            table: exploreName,
            fieldId: literal.fieldId,
            query: literal.value,
        }),
    );
    if (values.some((value) => literalMatches(literal, value)))
        return { ...literal, outcome: 'found' };
    const resolved = await resolveFieldValue({
        decisions,
        fieldId: literal.fieldId,
        requested: literal.value,
        values,
    });
    return resolved === null || resolved === literal.value
        ? { ...literal, outcome: 'missing' }
        : { ...literal, outcome: 'equivalent', equivalent: resolved };
};

export const equivalentValueHint = ({
    fieldId,
    value,
    equivalent,
}: FilterLiteral & { equivalent: string | number | boolean }): string =>
    `For ${fieldId}, ${JSON.stringify(equivalent)} is a likely equivalent of ${JSON.stringify(value)} from the available values. Verify it preserves the requested meaning before retrying.`;

/** Other visible string dimensions of the explore, base table first. */
const getOtherStringDimensionIds = (
    explore: Explore,
    fieldId: string,
): string[] =>
    getFields(explore)
        .filter(
            (field) =>
                isDimension(field) &&
                field.type === DimensionType.STRING &&
                !field.hidden &&
                getItemId(field) !== fieldId,
        )
        .sort(
            (a, b) =>
                Number(b.table === explore.baseTable) -
                Number(a.table === explore.baseTable),
        )
        .map(getItemId);

/** Finds a literal missing from its own field in another string dimension of the explore. */
export const findLiteralInOtherFields = async ({
    explore,
    literal,
    searchFieldValues,
    maxFields = 6,
}: {
    explore: Explore;
    literal: FilterLiteral;
    searchFieldValues: SearchFieldValuesFn;
    maxFields?: number;
}): Promise<string | null> => {
    const matches = await Promise.all(
        getOtherStringDimensionIds(explore, literal.fieldId)
            .slice(0, maxFields)
            .map(async (fieldId) => {
                try {
                    const values = toValues(
                        await searchFieldValues({
                            table: explore.name,
                            fieldId,
                            query: literal.value,
                        }),
                    );
                    const match =
                        values.find((value) =>
                            literalMatches(literal, value),
                        ) ??
                        values.find(
                            (value) =>
                                String(value).toLowerCase() ===
                                literal.value.toLowerCase(),
                        );
                    return match === undefined ? null : { fieldId, match };
                } catch {
                    return null;
                }
            }),
    );
    const found = matches.find((match) => match !== null);
    return found
        ? `${JSON.stringify(found.match)} is a value of ${found.fieldId}, not ${literal.fieldId}. Check it fits the request before retrying.`
        : null;
};

/** Resolves to the fallback once the budget elapses; value search can hit the warehouse. */
export const withinBudget = async <T>(
    promise: Promise<T>,
    ms: number,
    fallback: T,
): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((resolve) => {
                timer = setTimeout(() => resolve(fallback), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

export const getEmptyFilterHints = async ({
    decisions,
    query,
    searchFieldValues,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    query: Pick<MetricQuery, 'exploreName' | 'filters'>;
    searchFieldValues: SearchFieldValuesFn;
}): Promise<string> => {
    const lookup = Promise.all(
        getFilterLiterals(query.filters, [FilterOperator.EQUALS])
            .slice(0, 2)
            .map(async (literal) => {
                try {
                    const check = await checkFilterLiteral({
                        decisions,
                        exploreName: query.exploreName,
                        literal,
                        searchFieldValues,
                    });
                    return check.outcome === 'equivalent'
                        ? equivalentValueHint(check)
                        : null;
                } catch {
                    return null;
                }
            }),
    );
    // A slow lookup must not delay reporting a legitimate empty result.
    const hints = await withinBudget(lookup, 1_000, []);
    return hints.filter(Boolean).join(' ');
};
