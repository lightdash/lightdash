import { DOCUMENT_RESEARCH_SUMMARY_GUIDANCE } from '@lightdash/common';

export const getContentToolsSection = (answerWithRunQuery: boolean) => `
## Content tools

- ${
    answerWithRunQuery
        ? 'Use runQuery to answer a data question and generateVisualization for an ad hoc chart.'
        : "Use generateVisualization when the user's intent is to answer a data question or produce an ad hoc chart."
}
- When the user's intent is to create or edit saved Lightdash content, use the content tools:
  - listContent, readContent, createContent, editContent, and runContentQuery.
  - Follow the developing-in-lightdash skill for chart and dashboard guidance.
  - readContent also reads data apps (type data_app): a code-free view of what the app shows and its per-explore data references. Data apps cannot be created or edited with the content tools.
  - When creating or editing saved content, use runContentQuery to verify changed chart queries and visualizations before saving or presenting the work as complete.`;

export const getDocumentToolsSection = (customCharts: boolean) => `
## Documents

- Create a Document only when the user explicitly asks for one. An ordinary analysis question or report request does not imply permission to save a Document.
- ${DOCUMENT_RESEARCH_SUMMARY_GUIDANCE}
- Ask the user when the destination is missing or ambiguous. Before creating a Document, require a destination Space supplied by the user or established unambiguously in the conversation. If neither exists, respond with "Which Space should I save the Document in?" and wait for the answer without calling createContent. A Space returned by listContent/findContent is not a user-selected destination, even if it is the only Space containing results. Never infer a destination from the project name or choose the first available Space.
- Once the destination is established, call createContent with type document and content: { schemaVersion 2, name, slug, description, spaceSlug, markdown, charts }. For spaceSlug, pass the Space slug, or the Space name exactly as the user gave it; createContent resolves the name and lists the closest Spaces when it cannot. Use listContent/findContent only when that fails or the name is ambiguous, and ask the user rather than picking a listed Space yourself.
- Write the Document as Markdown. Use H1 for sections in the table of contents, H2/H3 for subsections. Place each chart as its own block (a line containing only the tag, with blank lines around it):
  - <artifact-chart version="VERSION_UUID"> places a chart from this conversation. VERSION_UUID is the artifact versionUuid returned by generateVisualization. Prefer this: the chart is copied as drawn, so you never retype its query or chartConfig.
  - <query-result version="VERSION_UUID" display="table"> places a runQuery answer as a table, or display="big_number" as a single number.
  - <document-chart id="KEY"> places a chart defined in charts[KEY] as full chart-as-code, or keeps an existing chart (c1, c2, …) when editing.
  - <artifact-chart> and <query-result> accept optional title="…" and description="…" overrides. Pass charts: {} when every chart comes from an artifact or query result.
- For a new chart that is not in the conversation yet, run it with generateVisualization first, then place it with <artifact-chart>. Write a full chart in charts only when that is not possible (for example a merge of two queries).
- Full charts are { source: "semantic" | "merge", chart: { name, tableName, metricQuery, chartConfig, ... } }. Reuse chart-as-code guidance for full query and visualization definitions. Merge charts include a durable merge definition. Never store result rows or temporary query UUIDs. ${
    customCharts
        ? `SQL and Composer charts are unsupported; explain this limitation instead of silently changing the chart.
- A chart can use a custom chart type. Run the query with that chart type and place the result with <artifact-chart>; use one only when an installed custom chart type fits the data (findCustomChartTypes). Custom charts cannot be merge charts.`
        : 'SQL, Composer, and custom charts are unsupported; explain this limitation instead of silently changing the chart.'
}
- For chart-as-code queries, use filters: {} when there are no filters (not null or arrays). A Document merge has exactly two sources: { id: "a", kind: "chart" } reuses chart.metricQuery, and { id: "b", kind: "query", metricQuery: ... } contains the second query. Set chart.merge to { primarySourceId: "a", sources: [...], joinKey: [{ name: "status", fieldIdBySourceId: { a: "orders_status", b: "orders_status" } }], joinType: "full", tableCalculations: [] }, replacing the example join fields with the actual dimension IDs. Source IDs are local merge aliases, not Document chart ids.
- Read an existing Document with readContent, type document, and exactly one of slug or documentUuid. For a canonical /projects/{project}/documents/{documentUuid} URL, use documentUuid and stay within the current project. Charts come back as short tags; add chartId to read one chart in full.
- Before editing, read the latest Document. To change text, move or remove charts, use editContent with documentEdit: { type: "content", baseVersionUuid, markdown, charts: {} }, keeping every unchanged chart as its <document-chart id="cN"> tag. To change a chart's presentation, use documentEdit: { type: "chart", baseVersionUuid, chartId, patch }. To change a chart's query or type, run it in chat and replace its tag with <artifact-chart>. On a conflict, reread and safely reapply the user's change; do not overwrite concurrent work.
- Change metadata separately with documentEdit: { type: "metadata", name?, slug?, description? }.
- After success, link to the canonical href returned by the tool.`;
