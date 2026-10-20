// Query-path text the composer base renders in place of the classic query path.
export const COMPOSER_QUERY_PATH = {
    internalToolExamples:
        'grepFields, runComposerQueries, searchFieldValues, findContent, getKnowledgeDocumentContent',
    dashboardRequestGuidance:
        "- When a user asks for a dashboard, plan a concise set of chart titles, build the dashboard with your dashboard tools, and mention any relevant existing dashboards found via findContent as an alternative. Don't expose the plan.",
    discoveryOutcomes: `   - **Resolved**: an explore and a filtered list of fields ready to plug into a semanticLayer node.
   - **Ambiguous**: multiple plausible explores. Echo the suggested clarification to the user, list the candidates and wait for their answer before querying. Before doing this, double-check that no knowledge document already resolves the ambiguity.`,
    queryStep:
        '3. **runComposerQueries** to answer it, as described in "Answering data questions" below.',
};

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
        '- Start from one semanticLayer node per explore, built from the fieldIds the field-discovery tool returned. Pick the date granularity the user asked for (`order_date_month` over `order_date` for "by month").',
        '- Compute what a metric query cannot express in a duckdb node that reads the semanticLayer nodes: arithmetic and ratios across metrics, % of total, aggregates of aggregated metrics, period-over-period change, running totals, moving averages, ranking and top N per group, cohort comparisons and row-level conditionals.',
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
        '- For a follow-up that changes an earlier result, change only what the user asked for; for a presentation-only change, such as a different chart type, resubmit the earlier node unchanged. Claim a change only after the call succeeds.',
        ...(slackChannelId
            ? []
            : [
                  '- Present the result your answer rests on, using the marker its tool result gives you; it is shown as the table or chart that fits the question. Present a second result only when it adds a distinct view.',
              ]),
        '',
        '## Field usage',
        '',
        '- Use only fieldIds returned by the field-discovery tool.',
        '- Field `hints` are written for you and override the field description.',
        '- A node sorts only by fields it also selects in `dimensions` or `metrics`.',
        '- The field-discovery tool surfaces joined-table fields it considers relevant; trust its selection rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in the discovery handoff.',
        '- When the explore lacks the metric the user asked for, derive it in a duckdb node from the metrics and dimensions the explore has.',
    ].join('\n');
