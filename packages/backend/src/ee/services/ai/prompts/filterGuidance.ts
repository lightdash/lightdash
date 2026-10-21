import {
    DimensionType,
    FILTER_EXPRESSION_GRAMMAR_DESCRIPTION,
    FilterOperator,
    FilterType,
    formatFilterExpressionExample,
    MetricType,
    UnitOfTime,
    type AiFilterExample,
} from '@lightdash/common';

export const STRUCTURED_FILTER_GUIDANCE_SECTION = `## Time-based filtering

When the user mentions a time window ("last 3 months", "this quarter", "past year", "since March"), add an explicit filter on a date dimension in \`filters.dimensions\`. Describing the window in the response, or sorting and limiting, is not a substitute: on sparse data it produces wrong results.

- Use \`inThePast\` for relative windows, \`inBetween\` for explicit ranges.
- A date field from a joined table filters exactly like a base-table date field, so filter on a joined-table date rather than leaving the window unfiltered.
- For several non-contiguous periods (e.g. "Mar or May 2025"), use a single \`equals\` rule on the date field at the requested granularity with one value per period (e.g. a month-grain field with values \`2025-03-01\` and \`2025-05-01\`), which keeps every filter under AND.
- Set the dimension filter \`type\` to \`or\` only when the date ranges are the sole dimension filters and no granularity-aligned \`equals\` rule fits (e.g. arbitrary day ranges like "Mar 1–6 vs Apr 1–6"), with one \`inBetween\` per range. \`or\` applies across all dimension filters in the group, so with a categorical (or any non-date) filter present it makes that filter optional and silently drops it.
- Use \`limit\` only for explicit "top N" / "show me 10 rows" requests.`;

const placementExamples = {
    dimensions: [
        {
            fieldId: 'orders_status',
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.EQUALS,
            values: ['completed', 'shipped'],
        },
        {
            fieldId: 'orders_order_date',
            fieldType: DimensionType.DATE,
            fieldFilterType: FilterType.DATE,
            operator: FilterOperator.IN_THE_PAST,
            values: [2],
            settings: {
                unitOfTime: UnitOfTime.weeks,
                completed: true,
            },
        },
    ],
    dimensionAlternatives: [
        {
            fieldId: 'orders_promo_code',
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.STARTS_WITH,
            values: ['VIP'],
        },
        {
            fieldId: 'orders_promo_code',
            fieldType: DimensionType.STRING,
            fieldFilterType: FilterType.STRING,
            operator: FilterOperator.ENDS_WITH,
            values: ['25'],
        },
    ],
    metrics: [
        {
            fieldId: 'orders_total_order_amount',
            fieldType: MetricType.SUM,
            fieldFilterType: FilterType.NUMBER,
            operator: FilterOperator.GREATER_THAN,
            values: [100],
        },
    ],
    tableCalculations: [
        {
            fieldId: 'rank',
            fieldType: DimensionType.NUMBER,
            fieldFilterType: FilterType.NUMBER,
            operator: FilterOperator.LESS_THAN_OR_EQUAL,
            values: [10],
        },
    ],
} satisfies Record<string, AiFilterExample[]>;

const renderConnectedExpression = (
    examples: AiFilterExample[],
    connector: 'AND' | 'OR',
): string => examples.map(formatFilterExpressionExample).join(` ${connector} `);

export const FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS = {
    dimensions: renderConnectedExpression(placementExamples.dimensions, 'AND'),
    dimensionAlternatives: renderConnectedExpression(
        placementExamples.dimensionAlternatives,
        'OR',
    ),
    metrics: renderConnectedExpression(placementExamples.metrics, 'AND'),
    tableCalculations: renderConnectedExpression(
        placementExamples.tableCalculations,
        'AND',
    ),
} satisfies Record<string, string>;

const FILTER_EXPRESSION_PLACEMENT_EXAMPLES = [
    'Raw placement examples:',
    `- dimensions: ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.dimensions}`,
    `- dimensions (alternatives): ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.dimensionAlternatives}`,
    `- metrics: ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.metrics}`,
    `- tableCalculations: ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.tableCalculations}`,
].join('\n');

const FILTER_EXPRESSION_SHARED_RULES = [
    'A non-null category contains one raw string expression.',
    'Choose the category from discovered field metadata (its dimension/metric kind), never from a field name or whether a numeric field sounds metric-like. A raw numeric dimension belongs in `dimensions`; only metrics and custom metrics belong in `metrics`.',
    'A field used only to restrict rows stays in its filter expression. Do not add it to `queryConfig.dimensions` unless the user asked to group by or display it: extra selected dimensions change aggregation and table-calculation grain.',
    'Table calculations belong only in `tableCalculations`.',
    'Each category is flat and uses AND or OR, never both.',
    'The three categories combine implicitly with AND.',
];

const filterExpressionGuidanceByRuntime = {
    agent: {
        heading: '## Filter expressions',
        introduction:
            'For `generateVisualization`, `dimensions`, `metrics`, and `tableCalculations` are independent string expressions or null.',
        additionalRules: [],
        searchFieldValuesRule:
            'When present, `searchFieldValues.filters` is one flat dimension expression string and is AND-only.',
    },
    mcp: {
        heading: '### Filter Expressions',
        introduction:
            'For `run_metric_query`, set `queryConfig.filters` to null when no query filters are needed. Otherwise, `dimensions`, `metrics`, and `tableCalculations` are independent string expressions or null.',
        additionalRules: [
            'Aggregation custom metric filters are flat AND expressions.',
        ],
        searchFieldValuesRule:
            'Omit `search_field_values.filters` for an unscoped search. When present, it is one flat dimension expression string and is AND-only.',
    },
} satisfies Record<
    'agent' | 'mcp',
    {
        heading: string;
        introduction: string;
        additionalRules: string[];
        searchFieldValuesRule: string;
    }
>;

const getFilterExpressionGuidanceSection = (
    runtime: keyof typeof filterExpressionGuidanceByRuntime,
) => {
    const guidance = filterExpressionGuidanceByRuntime[runtime];
    const rules = [
        ...FILTER_EXPRESSION_SHARED_RULES,
        ...guidance.additionalRules,
        guidance.searchFieldValuesRule,
        'The tool schema is authoritative for where each string is placed.',
    ]
        .map((rule) => `- ${rule}`)
        .join('\n');

    return `${guidance.heading}\n\n${guidance.introduction}\n\n${rules}\n\n${FILTER_EXPRESSION_PLACEMENT_EXAMPLES}\n\n${FILTER_EXPRESSION_GRAMMAR_DESCRIPTION}`;
};

export const MCP_FILTER_EXPRESSION_GUIDANCE_SECTION =
    getFilterExpressionGuidanceSection('mcp');

const EXPRESSION_TIME_FILTERING_GUIDANCE = `## Time-based filtering

When the user mentions a time window ("last 3 months", "this quarter", "past year", "since March"), put every requested window in the dimension expression as an explicit date rule. Describing the window in prose, sorting, limiting, or relying on dates observed in result data is not a substitute: on sparse data it produces wrong results.

- Use \`inThePast\` for relative windows and \`inBetween\` for explicit ranges.
- A date field from a joined table filters exactly like a base-table date field, so use a joined-table date rule rather than no date rule at all.
- For multiple granularity-aligned periods, use one multi-value \`equals\` rule when another dimension predicate must be combined with AND.
- Join arbitrary alternative ranges with OR only when every dimension rule is truly an alternative.
- Use \`limit\` only for explicit "top N" / "show me 10 rows" requests.`;

export const FILTER_EXPRESSION_GUIDANCE_SECTION = `${getFilterExpressionGuidanceSection('agent')}

${EXPRESSION_TIME_FILTERING_GUIDANCE}`;

export const COMPOSER_FILTER_GUIDANCE_SECTION = `## Filters

Filter a semanticLayer node with expression strings.

- Choose the kind from discovered field metadata (its dimension/metric kind). A raw numeric dimension belongs in \`dimensions\`; only metrics belong in \`metrics\`.
- A field used only to restrict rows stays in its filter expression. Add it to the node's \`dimensions\` only when the user asked to group by or display it: an extra dimension changes the grain.

Raw placement examples:
- dimensions: ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.dimensions}
- dimensions (alternatives): ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.dimensionAlternatives}
- metrics: ${FILTER_EXPRESSION_PLACEMENT_EXPRESSIONS.metrics}

${FILTER_EXPRESSION_GRAMMAR_DESCRIPTION}

${EXPRESSION_TIME_FILTERING_GUIDANCE}`;
