import { NO_MATCH_OUTCOME, type QueryPath } from './systemV2Template';

// Query-path text the composer base renders in place of the classic query path.
export const getComposerQueryPath = (
    canRunSql: boolean,
): Omit<QueryPath, 'queryLanguageSections'> => ({
    internalToolExamples:
        'grepFields, query, searchFieldValues, findContent, getKnowledgeDocumentContent',
    dashboardRequestGuidance:
        '- For a dashboard request, plan a concise set of chart titles, build the dashboard with your dashboard tools, and mention any relevant existing dashboards found via findContent as an alternative. Keep the plan internal.',
    discoveryOutcomes: `   - **Resolved**: an explore and a filtered list of fields ready to plug into a semanticLayer node.
   - **Ambiguous**: several plausible explores and no knowledge document that resolves the choice. Ask the user which one they mean, list the candidates and wait for their answer before querying.
${
    canRunSql
        ? '   - **No match**: no explore covers the request. Answer it with a `sql` node over the warehouse tables; when none holds the data, tell the user and offer alternatives when there are any.'
        : NO_MATCH_OUTCOME
}`,
    queryStep:
        '3. **query** to answer it, as described in "Answering data questions" below.',
});

export const getQueryingComposerSection = ({
    enablePythonNodes,
    canRunSql,
    slackChannelId,
}: {
    enablePythonNodes: boolean;
    canRunSql: boolean;
    slackChannelId: string | null;
}): string =>
    [
        '## Answering data questions',
        '',
        '- Query each explore with one semanticLayer node.',
        "- Combine semanticLayer nodes that meet on dimensions they share at the same grain (both by month, both by customer) with a merge node. It keeps each governed metric's label, format and description, and refuses a join that would count a metric twice. Each source node selects its join-key dimensions and metrics.",
        "- Compute everything over a merge's columns in its table calculations: ratios across sources, year on year, shares of total, lags, conditional labels. They keep the result governed.",
        '- When a merge is refused, fix the merge: narrow a source with a filter, raise its limit, or add the missing join key. If you answer another way instead, your answer says so and why.',
        '- Combine results any other way with a duckdb node: a join key that has to be computed or truncated to a shared grain, a union, or filtering and aggregating after the join.',
        '- Compute a metric the explore lacks as a custom metric on its semanticLayer node, and a metric in an earlier period as a period comparison there. The warehouse computes them in the same query, so the user gets the answer sooner and over every row.',
        ...(canRunSql
            ? [
                  "- Explores are governed and reusable, so use a `sql` node only when the user points you at a raw table or asks for SQL, or when the semantic layer cannot produce the result: a table outside every explore, a join key no explore exposes as a dimension, a computation whose row-level inputs would exceed a node's row limit, or warehouse-specific syntax.",
              ]
            : []),
        "- Compute what neither a metric query nor a merge calculation expresses in a duckdb node: over one semanticLayer node's results, arithmetic across metrics, % of total, the change between a metric and its period comparison, running totals, moving averages and ranking; over any node, aggregates of aggregated metrics, top N per group, cohort comparisons and reshaping.",
        ...(enablePythonNodes
            ? [
                  '- Run statistics, forecasts and other algorithms that SQL expresses poorly in a python node. Every datetime it reads and returns is tz-naive UTC wall clock, so compare with naive literals and never localize. Its returned DataFrame comes back typed: a datetime column named like a timestamp input stays a timestamp, any other holding only midnights becomes dates; NaN, infinity and NaT become null. stdout is discarded; an exception returns its traceback.',
              ]
            : []),
        '- Build an answer that takes several queries, or a computation over their results, as one pipeline in one query call, whose terminal node is the result that answers the question.',
        '- For a follow-up that changes an earlier result, change only what the user asked for, and claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.',
        slackChannelId
            ? '- After query, call visualize on the node your answer rests on when the user asks for a chart or when its rows materially help: with the chart type the user asked for; otherwise with a chart that fits the result (a line for a trend over time, a bar to compare categories), or a table. Skip visualize when a sentence answers the question.'
            : '- After query, call visualize on the node your answer rests on: with the chart type the user asked for; otherwise with a chart that fits the result (a line for a trend over time, a bar to compare categories), or a table when the user wants an interactive or downloadable table or the rows are too many for a Markdown table. Skip visualize when a sentence or a small Markdown table answers the question and the user asked for no chart.',
        '- Visualize a second node only when it adds a distinct view. To visualize an earlier result again, or as another chart, call visualize on its node rather than rerunning query.',
        ...(slackChannelId
            ? []
            : [
                  '- Cite each figure in your answer that comes from a node you did not visualize in this answer by wrapping it as `[figure](#query-node-<nodeId>)`, with the figure exactly as written and a node id from this thread, one citation per node per sentence. For example:',
                  '  - Figures from separate nodes: `Total revenue is [**$4,149.12**](#query-node-total_revenue) across [151 orders](#query-node-order_count), about [$27.48](#query-node-avg_revenue) per order.`',
                  '  - Two figures from one node: `Completed orders brought in [$2,310.40](#query-node-revenue_by_status) and returned orders $412.18.`',
                  '  - After visualizing `monthly_revenue`: `Revenue peaked at $612 in March, and the top store made [$98](#query-node-top_store) of it.`',
              ]),
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by discovery.',
        '- Field `hints` are written for you and override the field description.',
        '- For date dimensions, pick the granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
    ].join('\n');
