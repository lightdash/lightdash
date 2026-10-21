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
        'Answer data questions with runComposerQueries.',
        '',
        '- Start from one semanticLayer node per explore, built from the fieldIds discovery returned. Pick the date granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Compute what a metric query cannot express in a duckdb node that reads the semanticLayer nodes: arithmetic and ratios across metrics, % of total, aggregates of aggregated metrics, period-over-period change, running totals, moving averages, ranking and top N per group, cohort comparisons and row-level conditionals.',
        '- A duckdb node computes over the rows its source nodes returned. Before aggregating or ranking over a source, give that semanticLayer node a limit that holds its whole population, or aggregate in the semanticLayer node itself: a result that reached its row limit is incomplete, so a total, an average or a rank built on it is wrong.',
        '- Combine explores that are not joined in the semantic layer with one semanticLayer node per explore plus a duckdb node that joins their results.',
        ...(enablePythonNodes
            ? [
                  '- Run statistics, forecasts and other algorithms in a python node that reads the results it needs.',
              ]
            : []),
        `- Build an answer that takes several queries or a computation over their results as one pipeline in one call: source nodes fetch, duckdb nodes join and reshape${
            enablePythonNodes ? ', python nodes run the algorithm' : ''
        }, and the terminal node is ${
            slackChannelId
                ? 'the table you can share'
                : 'the result you present'
        }.`,
        '- For a follow-up that changes an earlier result, change only what the user asked for, and claim a change only after the call succeeds. When the requested field is not among the carried-forward candidates, discover it rather than binding its value to an unrelated existing dimension.',
        ...(slackChannelId
            ? []
            : [
                  '- Present the result your answer rests on, using the marker its tool result gives you; it is shown as a table. Present a second result only when it adds a distinct view.',
                  '- To show an earlier result again, write its marker instead of rerunning it.',
              ]),
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by discovery.',
        '- Field `hints` are written for you and override the field description.',
        '- A node sorts only by fields it also selects in `dimensions` or `metrics`.',
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
        '- When the explore lacks the metric the user asked for, derive it in a duckdb node from the metrics and dimensions the explore has.',
    ].join('\n');
