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
    enableApiNodes,
    canRunSql,
    slackChannelId,
}: {
    enablePythonNodes: boolean;
    enableApiNodes: boolean;
    canRunSql: boolean;
    slackChannelId: string | null;
}): string =>
    [
        '## Answering data questions',
        '',
        '- Query each explore with one semanticLayer node, and combine explores that are not joined in the semantic layer with a duckdb node that joins their results.',
        "- Compute a metric the explore lacks as a custom metric on its semanticLayer node, and a metric in an earlier period as a period comparison there. The warehouse computes them in the same query, so the user gets the answer sooner and over every row; aggregating in a duckdb or python node waits on an extra query and sees only the rows within its source node's limit.",
        ...(canRunSql
            ? [
                  "- Explores are governed and reusable, so use a `sql` node only when the user points you at a raw table or asks for SQL, or when the semantic layer cannot produce the result: a table outside every explore, a join key no explore exposes as a dimension, a computation whose row-level inputs would exceed a node's row limit, or warehouse-specific syntax.",
              ]
            : []),
        '- Compute what a metric query cannot express in a duckdb node that reads the semanticLayer nodes: arithmetic and ratios across metrics, % of total, aggregates of aggregated metrics, the change between a metric and its period comparison, running totals, moving averages, ranking and top N per group, cohort comparisons, row-level conditionals and reshaping.',
        ...(enablePythonNodes
            ? [
                  '- Run statistics, forecasts and other algorithms that SQL expresses poorly in a python node.',
              ]
            : []),
        ...(enableApiNodes
            ? [
                  '- Answer questions about product usage tracked in PostHog (events, users, sessions) with an api node running HogQL, and prefer an explore when one already models that data. Join api rows with semanticLayer rows in a duckdb node, matching their grain and date truncation first.',
              ]
            : []),
        '- Build an answer that takes several queries, or a computation over their results, as one pipeline in one query call, whose terminal node is the result that answers the question.',
        '- For a follow-up that changes an earlier result, change only what the user asked for, and claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.',
        slackChannelId
            ? '- After query, call visualize on the node your answer rests on when the user asks for a chart or when its rows materially help: with the chart type the user asked for; otherwise with a chart that fits the result (a line for a trend over time, a bar to compare categories), or a table. Skip visualize when a sentence answers the question.'
            : '- After query, call visualize on the node your answer rests on: with the chart type the user asked for; otherwise with a chart that fits the result (a line for a trend over time, a bar to compare categories), or a table when the user wants an interactive or downloadable table or the rows are too many for a Markdown table. Skip visualize when a sentence or a small Markdown table answers the question and the user asked for no chart.',
        '- Visualize a second node only when it adds a distinct view. To visualize an earlier result again, or as another chart, call visualize on its node rather than rerunning query.',
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by discovery.',
        '- Field `hints` are written for you and override the field description.',
        '- For date dimensions, pick the granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
    ].join('\n');
