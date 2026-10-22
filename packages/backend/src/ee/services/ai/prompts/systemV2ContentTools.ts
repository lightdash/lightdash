const getQueryTools = (composer: boolean, canRunQuery: boolean): string => {
    if (composer) return 'query';
    return canRunQuery
        ? 'runQuery and generateVisualization'
        : 'generateVisualization';
};

export const getContentToolsSection = ({
    canRunQuery,
    viaComposerQueries,
}: {
    canRunQuery: boolean;
    viaComposerQueries: boolean;
}) => `
## Content tools

- Use the content tools when the user's intent is to create or edit saved content: charts, dashboards and SQL charts kept in the project. Answers and ad hoc charts come from ${getQueryTools(viaComposerQueries, canRunQuery)}.
- For chart and dashboard JSON, follow the developing-in-lightdash skill: it holds their shapes and the chart-type references.
- Before saving a new or changed chart or presenting the work as complete, check its query and visualization with runContentQuery.
- After creating or editing content, link the user to the href the tool returns.`;

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
    'Want me to save this as a Document you can share?';

export const DOCUMENT_NUDGES_GUIDANCE = `
- Documents are shareable write-ups that combine narrative and charts.
  - When this reply creates a chart and an earlier reply in this conversation also created one, or the reply concludes a finding that took several steps, end the reply with this line on its own: "${DOCUMENT_OFFER_LINE}" Offer only once per conversation: skip it if a Document was already offered or created, and never after a single quick question.
  - When looking for existing content, include Documents. When an existing Document covers the question, link it.`;
