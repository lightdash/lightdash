import {
    COMPOSER_RULES,
    getComposerFollowUpChangeRule,
} from '@lightdash/common';
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
        `- ${COMPOSER_RULES.oneNodePerExplore}`,
        `- ${COMPOSER_RULES.merge} ${COMPOSER_RULES.mergeDetail}`,
        `- ${COMPOSER_RULES.mergeTableCalculations}`,
        `- ${COMPOSER_RULES.mergeRefused}`,
        `- ${COMPOSER_RULES.duckdbCombine}`,
        `- ${COMPOSER_RULES.customMetric}`,
        ...(canRunSql ? [`- ${COMPOSER_RULES.sqlNode}`] : []),
        `- ${COMPOSER_RULES.duckdbCompute}`,
        ...(enablePythonNodes
            ? [
                  `- ${COMPOSER_RULES.pythonNode} Every datetime it reads and returns is tz-naive UTC wall clock, so compare with naive literals and never localize. Its returned DataFrame comes back typed: a datetime column named like a timestamp input stays a timestamp, any other holding only midnights becomes dates; NaN, infinity and NaT become null. stdout is discarded; an exception returns its traceback.`,
              ]
            : []),
        `- ${COMPOSER_RULES.onePipeline}`,
        `- ${COMPOSER_RULES.followUpPlan}`,
        `- ${getComposerFollowUpChangeRule(true)}`,
        slackChannelId
            ? '- After query, call visualize on the node your answer rests on when the user asks for a chart or when its rows materially help: with the chart type the user asked for; otherwise with a chart that fits the result, or a table. Skip visualize when a sentence answers the question.'
            : '- After query, call visualize on the node your answer rests on: with the chart type the user asked for; otherwise with a chart that fits the result, or a table when the user wants an interactive or downloadable table or the rows are too many for a Markdown table. Skip visualize when a sentence (a handful of figures) or a Markdown table (up to about 10 rows) answers the question and the user asked for no chart.',
        '- Shape a node for its chart, whether you query for the chart or the user asks to chart an earlier answer. A node that answered a question in text often lacks this shape, so query a new node that has it and visualize that one:',
        '  - Names: categories named by a readable dimension (customer name, not customer id).',
        '  - Grain: one row per category, period, stage or point, and per series when a column splits them. Series as separate value columns, or as one column to group by, are both shaped for a bar, line or area chart.',
        '  - Order: by value for a ranking, in order for time or stages.',
        '  - Values over time: per period, or a running total when the user asks for one or the question is progress toward a total or target.',
        '- Visualize a second node only when it adds a distinct view. An earlier node already shaped for the chart needs no new query: call visualize on it again.',
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
        `- ${COMPOSER_RULES.fieldHints}`,
        `- ${COMPOSER_RULES.dateGranularity}`,
        '- Discovery returns the joined-table fields it judges relevant; use them rather than substituting a base-table field with a similar name. Joined-table fields are marked `isFromJoinedTable="true"` in discovery results.',
    ].join('\n');
