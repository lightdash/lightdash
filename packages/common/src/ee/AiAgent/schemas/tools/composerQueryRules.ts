// Composer rules shared by the agent prompt, the MCP `query` description and the MCP `query-pipelines` skill.
export const COMPOSER_RULES = {
    oneNodePerExplore: 'Query each explore with one semanticLayer node.',
    merge: 'Combine semanticLayer nodes that meet on dimensions they share at the same grain (both by month, both by customer) with a merge node.',
    mergeDetail:
        "It keeps each governed metric's label, format and description, and refuses a join that would count a metric twice. Each source node selects its join-key dimensions and metrics.",
    mergeTableCalculations:
        "Compute everything over a merge's columns in its table calculations: ratios across sources, year on year, shares of total, lags, conditional labels. They keep the result governed.",
    mergeRefused:
        'When a merge is refused, fix the merge: narrow a source with a filter, raise its limit, or add the missing join key. If you answer another way instead, your answer says so and why.',
    duckdbCombine:
        'Combine results any other way with a duckdb node: a join key that has to be computed or truncated to a shared grain, a union, or filtering and aggregating after the join.',
    customMetric:
        'Compute a metric the explore lacks as a custom metric on its semanticLayer node, with a filter when it covers only some rows (completed orders among all orders), and a metric in an earlier period as a period comparison there. The warehouse computes them in the same query, so the user gets the answer sooner and over every row.',
    sqlNode:
        "Explores are governed and reusable, so use a `sql` node only when the user points you at a raw table or asks for SQL, or when the semantic layer cannot produce the result: a table outside every explore, a join key no explore exposes as a dimension, a computation whose row-level inputs would exceed a node's row limit, or warehouse-specific syntax.",
    noExplore:
        'When no explore covers the request and the user names no warehouse table, say so and offer alternatives when there are any. When they ask for raw SQL without the table or column names it needs, ask for them.',
    duckdbCompute:
        "Compute what neither a metric query nor a merge calculation expresses in a duckdb node: over one semanticLayer node's results, arithmetic across metrics, % of total, the change between a metric and its period comparison, running totals, moving averages and ranking; over any node, aggregates of aggregated metrics, top N per group, cohort comparisons and reshaping.",
    pythonNode:
        'Run statistics, forecasts and other algorithms that SQL expresses poorly in a python node.',
    onePipeline:
        'Build an answer that takes several queries, or a computation over their results, as one pipeline in one query call, whose terminal node is the result that answers the question.',
    followUpPlan:
        'When a follow-up needs a new query, plan its pipeline as for a first question: the fewest nodes from source to result, counting the earlier nodes it reads, and among such plans the one that reads earlier nodes unchanged.',
    fieldHints:
        'Field `hints` are written for you and override the field description.',
    dateGranularity:
        'For date dimensions, pick the granularity the user asked for (`order_date_month` over `order_date` for "by month").',
} as const;

export const toComposerRuleBullets = (rules: string[]) =>
    rules.map((rule) => `- ${rule}`).join('\n');

export const getComposerFollowUpChangeRule = (keepsChartType: boolean) =>
    `For a follow-up that changes an earlier result, change only what the user asked for and keep the rest: metrics, filters, period, grouping, ${
        keepsChartType ? 'sort, chart type' : 'sort'
    } and the rows shown, zero and small values included. Claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.`;

export const QUERY_PIPELINES_SKILL_NAME = 'query-pipelines';

/** First sentence of the MCP `query` description and first line of the composer server instructions. */
export const QUERY_PIPELINES_SKILL_POINTER = `Before your first query call, read the query pipeline rules and examples: call read_skill with name "${QUERY_PIPELINES_SKILL_NAME}".`;
