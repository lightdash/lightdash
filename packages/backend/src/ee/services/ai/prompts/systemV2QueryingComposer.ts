import type { QueryPath } from './systemV2Template';

// Query-path text the composer base renders in place of the classic query path.
export const COMPOSER_QUERY_PATH = {
    internalToolExamples:
        'grepFields, query, searchFieldValues, findContent, getKnowledgeDocumentContent',
    dashboardRequestGuidance:
        '- For a dashboard request, plan a concise set of chart titles, build the dashboard with your dashboard tools, and mention any relevant existing dashboards found via findContent as an alternative. Keep the plan internal.',
    discoveryOutcomes: `   - **Resolved**: an explore and a filtered list of fields ready to plug into a semanticLayer node.
   - **Ambiguous**: several plausible explores and no knowledge document that resolves the choice. Ask the user which one they mean, list the candidates and wait for their answer before querying.`,
    queryStep:
        '3. **query** to answer it, as described in "Answering data questions" below.',
} satisfies Omit<QueryPath, 'queryLanguageSections'>;

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
        '- Query each explore with one semanticLayer node, and combine explores that are not joined in the semantic layer with a duckdb node that joins their results.',
        ...(canRunSql
            ? [
                  '- Use a semanticLayer node when an explore covers the question: it is governed and reusable. Use a `sql` node for joins across tables no explore models, recursive CTEs, percentile functions (PERCENTILE_CONT) or warehouse-specific syntax a semanticLayer node cannot produce, lookups in raw tables outside any explore, or when the user asks for raw SQL.',
              ]
            : []),
        '- Compute what a metric query cannot express in a duckdb node that reads the semanticLayer nodes: arithmetic and ratios across metrics, % of total, aggregates of aggregated metrics, period-over-period change, running totals, moving averages, ranking and top N per group, cohort comparisons, row-level conditionals, reshaping, and a metric the explore lacks, derived from the metrics and dimensions it has.',
        ...(enablePythonNodes
            ? [
                  '- Run statistics, forecasts and other algorithms that SQL expresses poorly in a python node.',
              ]
            : []),
        `- Build an answer that takes several queries, or a computation over their results, as one pipeline in one query call, whose terminal node is ${
            slackChannelId
                ? 'the table you can share'
                : 'the result that answers the question'
        }.`,
        '- For a follow-up that changes an earlier result, change only what the user asked for, and claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.',
        ...(slackChannelId
            ? []
            : [
                  '- After query, call visualize on the node your answer rests on: with the chart type the user asked for; otherwise with a chart that fits the result (a line for a trend over time, a bar to compare categories), or a table when the user wants an interactive or downloadable table or the rows are too many for a Markdown table. Skip visualize when a sentence or a small Markdown table answers the question and the user asked for no chart.',
                  '- Visualize a second node only when it adds a distinct view. To show an earlier result again, or as another chart, visualize its node again rather than rerunning query.',
              ]),
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by discovery.',
        '- Field `hints` are written for you and override the field description.',
        '- For date dimensions, pick the granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
    ].join('\n');
