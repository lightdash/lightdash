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

export const STRUCTURED_SEARCH_FIELD_VALUES_FILTER_GUIDANCE =
    'Set `filters` to null when no additional scope is needed. If `filters` is non-null, include `type`, `dimensions`, `metrics`, and `tableCalculations`, using null or [] for every unused category.';

export const EXPRESSION_SEARCH_FIELD_VALUES_FILTER_GUIDANCE =
    'Omit `filters` when the search is unscoped. When present, `filters` scopes the candidate-value search and is one raw, flat, dimension-only AND expression.';

export const STRUCTURED_FILTER_GUIDANCE_SECTION = `## Time-based filtering

If the user mentions any time window ("last 3 months", "this quarter", "past year", "since March"), you MUST add an explicit filter on a date dimension in \`filters.dimensions\`. Describing the window in the response or sorting + limiting is not a substitute — sparse data will produce wrong results.

- Use \`inThePast\` for relative windows, \`inBetween\` for explicit ranges.
- Relative windows resolve against today's date, stated at the top of this prompt. Never anchor them to dates seen in field metadata or query results.
- Date fields from joined tables work identically to base-table date fields in filters. Prefer filtering on a joined-table date over no filter at all.
- Selecting or comparing multiple non-contiguous periods (e.g. "Mar or May 2025"): prefer a single \`equals\` rule on the date field at the requested granularity with one value per period (e.g. a month-grain field with values \`2025-03-01\` and \`2025-05-01\`). This keeps every filter under AND.
- Never set the dimension filter \`type\` to \`or\` when the query also has a categorical (or any non-date) filter. \`or\` applies across all dimension filters in the group, so the categorical filter becomes optional and is silently dropped. Only use \`type: or\` with one \`inBetween\` per range when the date ranges are the sole dimension filter and no granularity-aligned \`equals\` rule fits (e.g. arbitrary day ranges like "Mar 1–6 vs Apr 1–6").
- Use \`limit\` only for explicit "top N" / "show me 10 rows" requests, never to approximate a time window.`;

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

export const FILTER_EXPRESSION_GUIDANCE_SECTION = `## Filter expressions

For \`generateVisualization\`, \`dimensions\`, \`metrics\`, and \`tableCalculations\` are independent string expressions or null.

- A non-null category contains one raw string expression.
- Choose the category from discovered field metadata (its dimension/metric kind), never from a field name or whether a numeric field sounds metric-like. A raw numeric dimension belongs in \`dimensions\`; only metrics and custom metrics belong in \`metrics\`.
- A field used only to restrict rows stays in its filter expression. Do not add it to \`queryConfig.dimensions\` unless the user asked to group by or display it: extra selected dimensions change aggregation and table-calculation grain.
- Table calculations belong only in \`tableCalculations\`.
- Each category is flat and uses AND or OR, never both.
- The three categories combine implicitly with AND.
- When present, \`searchFieldValues.filters\` is one flat dimension expression string and is AND-only.
- The tool schema is authoritative for where each string is placed.

${FILTER_EXPRESSION_PLACEMENT_EXAMPLES}

${FILTER_EXPRESSION_GRAMMAR_DESCRIPTION}

## Time-based filtering

If the user mentions any time window ("last 3 months", "this quarter", "past year", "since March"), every requested window MUST appear as an explicit date rule in the dimension expression. Describing the window, sorting, limiting, prose, or dates observed in result data is not a substitute.

- Use \`inThePast\` for relative windows and \`inBetween\` for explicit ranges.
- Relative windows resolve against today's date, stated at the top of this prompt. Never anchor them to dates seen in field metadata or query results.
- Date fields from joined tables work identically to base-table date fields. Prefer filtering on a joined-table date over no date rule at all.
- For multiple granularity-aligned periods, use one multi-value \`equals\` rule when another dimension predicate must be combined with AND.
- Arbitrary alternative ranges may use OR only when every dimension rule is truly an alternative. Never mix root AND and OR in one category.
- Use \`limit\` only for explicit "top N" / "show me 10 rows" requests, never to approximate a time window.`;
