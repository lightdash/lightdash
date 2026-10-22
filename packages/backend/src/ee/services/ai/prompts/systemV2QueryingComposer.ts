import type { QueryPath } from './systemV2Template';

// Query-path text the composer base renders in place of the classic query path.
export const COMPOSER_QUERY_PATH = {
    internalToolExamples:
        'grepFields, runComposerQueries, searchFieldValues, findContent, getKnowledgeDocumentContent',
    dashboardRequestGuidance:
        '- For a dashboard request, plan a concise set of chart titles, build the dashboard with your dashboard tools, and mention any relevant existing dashboards found via findContent as an alternative. Keep the plan internal.',
    discoveryOutcomes: `   - **Resolved**: an explore and a filtered list of fields ready to plug into a semanticLayer node.
   - **Ambiguous**: several plausible explores and no knowledge document that resolves the choice. Ask the user which one they mean, list the candidates and wait for their answer before querying.`,
    queryStep:
        '3. **runComposerQueries** to answer it, as described in "Answering data questions" below.',
} satisfies Omit<QueryPath, 'queryLanguageSections'>;

export const getQueryingComposerSection = ({
    enablePythonNodes,
    slackChannelId,
}: {
    enablePythonNodes: boolean;
    slackChannelId: string | null;
}): string =>
    [
        '## Answering data questions',
        '',
        '- Query each explore with one semanticLayer node, and combine explores that are not joined in the semantic layer with a duckdb node that joins their results.',
        '- Compute what a metric query cannot express in a duckdb node that reads the semanticLayer nodes: arithmetic and ratios across metrics, % of total, aggregates of aggregated metrics, period-over-period change, running totals, moving averages, ranking and top N per group, cohort comparisons, row-level conditionals, reshaping, and a metric the explore lacks, derived from the metrics and dimensions it has.',
        ...(enablePythonNodes
            ? [
                  '- Run statistics, forecasts and other algorithms that SQL expresses poorly in a python node.',
              ]
            : []),
        `- Build an answer that takes several queries, or a computation over their results, as one pipeline in one runComposerQueries call, whose terminal node is ${
            slackChannelId
                ? 'the table you can share'
                : 'the result you present'
        }.`,
        '- For a follow-up that changes an earlier result, change only what the user asked for, and claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.',
        ...(slackChannelId
            ? []
            : [
                  '- Present the result your answer rests on; it is shown as a table. Present a second result only when it adds a distinct view, and present an earlier result again rather than rerunning it.',
              ]),
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by discovery.',
        '- Field `hints` are written for you and override the field description.',
        '- For date dimensions, pick the granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
    ].join('\n');
