import type { CustomSqlPermissions } from '../types/aiAgent';

const getQueryTools = (composer: boolean, canRunQuery: boolean): string => {
    if (composer) return 'query and visualize';
    return canRunQuery
        ? 'runQuery and generateVisualization'
        : 'generateVisualization';
};

const getCustomSqlLines = ({
    canSaveSqlCharts,
    canAuthorCustomSqlFields,
    canAuthorSqlTableCalculations,
}: CustomSqlPermissions): string =>
    [
        canSaveSqlCharts
            ? 'Before creating a SQL chart, read sql-chart-reference in the developing-in-lightdash skill: it says when to create one.'
            : 'SQL charts cannot be saved here: build charts from explore fields instead, and say so when asked for a SQL chart.',
        canAuthorCustomSqlFields
            ? null
            : 'The user cannot add or change custom SQL dimensions or custom metrics with hand-written SQL: use explore fields instead.',
        canAuthorSqlTableCalculations
            ? null
            : 'The user cannot add or change SQL table calculations: use formula or template table calculations instead.',
    ]
        .filter((line): line is string => line !== null)
        .map((line) => `\n- ${line}`)
        .join('');

export const getContentToolsSection = ({
    canRunQuery,
    viaComposerQueries,
    customSqlPermissions,
}: {
    canRunQuery: boolean;
    viaComposerQueries: boolean;
    customSqlPermissions: CustomSqlPermissions;
}) => `
## Content tools

- Use the content tools when the user's intent is to create or edit saved content: charts, dashboards and SQL charts kept in the project, and composer charts on dashboards. Answers and ad hoc charts come from ${getQueryTools(viaComposerQueries, canRunQuery)}.
- The shapes below cover dashboards and big number, bar, line, pie and table charts. For other chart types and options, load the matching developing-in-lightdash skill resource.${getCustomSqlLines(customSqlPermissions)}
- Before creating a composer chart, read composer-chart-reference in the developing-in-lightdash skill: it says when to create one.
- Save a chart without a test query: createContent and editContent check every field id against the explore and refuse unknown ones, naming the closest ids.
- Create a new dashboard and all its charts in one response: the dashboard createContent call first (tiles: []), then one call per chart with dashboardSlug set. Calls run in that order and each chart gets a tile in rows that fill the grid, so the layout needs no edit.
- Put every change to one chart or dashboard in a single editContent call; edit a chart and its dashboard in the same response when both change.
- After saving, reply in one or two sentences with the link the tool returned; the user sees the charts there.

Chart (createContent type chart):
\`\`\`json
{"slug":"orders-by-status","name":"Orders by status","description":null,"spaceSlug":"<space>","dashboardSlug":"<dashboard>","version":1,"contentType":"chart","verified":false,"tableName":"<explore>","metricQuery":{"exploreName":"<explore>","dimensions":["orders_status"],"metrics":["orders_count"],"filters":{},"sorts":[{"fieldId":"orders_count","descending":true}],"limit":500,"tableCalculations":[]},"chartConfig":<one below>}
\`\`\`
- big number (no dimensions, limit 1): {"type":"big_number","config":{"label":"Orders","selectedField":"orders_count"}}
- bar or line: {"type":"cartesian","config":{"layout":{"xField":"orders_status","yField":["orders_count"]},"eChartsConfig":{"series":[{"type":"bar","encode":{"xRef":{"field":"orders_status"},"yRef":{"field":"orders_count"}},"yAxisIndex":0}]}}}; "line" for trends, sorted by the date ascending.
- stacked bar split by a second dimension: add it to metricQuery.dimensions and to "pivotConfig":{"columns":[...]}, set layout "stack":"stack" and one series {"type":"bar","stack":"stack",...}; a series per value is drawn from the results.
- pie: {"type":"pie","config":{"groupFieldIds":["orders_status"],"metricId":"orders_count"}}
- table: {"type":"table","config":{}} with "tableConfig":{"columnOrder":[dimensions, then metrics]}
Every metricQuery dimension must be the x field, a pivot column, or a table column.

Dashboard (createContent type dashboard): {"slug","name","description","spaceSlug","version":1,"contentType":"dashboard","verified":false,"tiles":[],"tabs":[],"filters":{"dimensions":[],"metrics":[],"tableCalculations":[]}}
Dashboard filter (an item of filters.dimensions): {"slug":"status","label":"Status","operator":"equals","values":[],"target":{"fieldId":"orders_status","tableName":"orders"}}; empty values show the filter without filtering.`;

const getChartPlacement = (composer: boolean, customCharts: boolean) => {
    // Composer results cannot be placed in a Document, so composer charts are written in full.
    if (composer)
        return "- Define each chart in full under charts, since results from this conversation cannot be placed in a Document; to change a chart's query or type, replace its definition.";
    const customChartPlacement = customCharts
        ? '\n- A chart can use a custom chart type that fits the data (findCustomChartTypes): draw it with that chart type and place it with <artifact-chart>.'
        : '';
    return `- Place a chart or table from this conversation with the Document tag its query result gives: <artifact-chart version="…"> for a generateVisualization chart, <query-result version="…" display="table"> for a runQuery answer (display="big_number" for a single number) or a runSql result (as a SQL table). Both tags accept title="…" and description="…". A tag copies the chart as drawn, so prefer it to a full chart under charts: draw a new chart with generateVisualization first, and change a chart's query or type by drawing the new version and replacing its tag.${customChartPlacement}`;
};

export const getDocumentToolsSection = ({
    customCharts,
    nudges,
    viaComposerQueries,
}: {
    customCharts: boolean;
    nudges: boolean;
    viaComposerQueries: boolean;
}) => `
## Documents

- ${
    nudges
        ? 'Create a Document when the user asks for one, accepts your offer to save the analysis as a Document, or asks for a report, write-up or summary to share. An ordinary analysis question does not imply permission to save a Document.'
        : 'Create a Document only when the user explicitly asks for one. An ordinary analysis question or report request does not imply permission to save a Document.'
}
- When the user named no Space, the Document is personal: tell them so, and that it can be saved to a Space later.
- Before editing a Document, read its latest version with readContent.
${getChartPlacement(viaComposerQueries, customCharts)}
- You cannot create or change merge charts, composer charts${
    customCharts && !viaComposerQueries ? '' : ' or custom charts'
}. Keep an existing one by its tag, and when the user asks for one, explain the limitation instead of silently changing the chart.`;

export const DOCUMENT_OFFER_LINE =
    'Want me to turn this analysis into a Document, a shareable report with these charts and a written summary?';

// Offer lines earlier releases wrote into threads, still recognised so old threads are not offered twice.
const LEGACY_DOCUMENT_OFFER_LINES = [
    'Want me to save this as a Document you can share?',
];

const DOCUMENT_OFFER_LINES = [
    DOCUMENT_OFFER_LINE,
    ...LEGACY_DOCUMENT_OFFER_LINES,
];

export const includesDocumentOffer = (text: string): boolean =>
    DOCUMENT_OFFER_LINES.some((line) => text.includes(line));

export const removeDocumentOffer = (text: string): string =>
    DOCUMENT_OFFER_LINES.reduce((rest, line) => rest.replace(line, ''), text);

/** Charts a thread needs before a Document is offered: a single chart or a quick follow-up is not an analysis. */
export const MIN_CHARTS_FOR_DOCUMENT_OFFER = 3;

export const DOCUMENT_NUDGES_GUIDANCE = `
- Documents are shareable write-ups that combine narrative and charts.
  - Offer a Document only once the conversation holds a substantial analysis: at least ${MIN_CHARTS_FOR_DOCUMENT_OFFER} charts across several turns exploring one topic, and this reply concludes a finding from them. Then end the reply with this line on its own: "${DOCUMENT_OFFER_LINE}" Offer only once per conversation: skip it if a Document was already offered or created, and never after a single chart or a quick question.
  - When looking for existing content, include Documents. When an existing Document covers the question, link it.`;
