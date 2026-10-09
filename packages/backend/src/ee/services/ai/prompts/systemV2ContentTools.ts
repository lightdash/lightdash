import {
    DOCUMENT_RESEARCH_SUMMARY_DEFAULT,
    DOCUMENT_RESEARCH_SUMMARY_GUIDANCE,
} from '@lightdash/common';

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

export const getDocumentToolsSection = (
    customCharts: boolean,
    nudges: boolean,
) => `
## Documents

- ${
    nudges
        ? 'Create a Document when the user asks for one, accepts your offer to save the analysis as a Document, or asks for a report, write-up or summary to share. An ordinary analysis question does not imply permission to save a Document.'
        : 'Create a Document only when the user explicitly asks for one. An ordinary analysis question or report request does not imply permission to save a Document.'
}
- ${nudges ? DOCUMENT_RESEARCH_SUMMARY_DEFAULT : DOCUMENT_RESEARCH_SUMMARY_GUIDANCE}
- Do not ask where to save a Document. Call createContent with type document and content: { schemaVersion 2, name, slug, description, spaceSlug, markdown, charts }. Pass spaceSlug only for a Space the user named or established unambiguously in the conversation: the Space slug, or the Space name exactly as the user gave it; createContent resolves the name and lists the closest Spaces when it cannot. Otherwise pass spaceSlug: null to create a personal Document that only the user and admins can see. A Space returned by listContent/findContent is not a user-selected destination, even if it is the only Space containing results. Never infer a Space from the project name or choose the first available Space.
- After creating a personal Document, say it is personal and can be saved to a Space later. When the user asks to save it to a Space, use editContent with documentEdit: { type: "metadata", spaceSlug }, resolving the Space the same way. Only personal Documents can be saved this way.
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
- Read an existing Document with readContent, type document, and its slug. Charts come back as short tags; add chartId to read one chart in full.
- Before editing, read the latest Document. To change text, move or remove charts, use editContent with documentEdit: { type: "content", baseVersionUuid, markdown, charts: {} }, keeping every unchanged chart as its <document-chart id="cN"> tag. To change a chart's presentation, use documentEdit: { type: "chart", baseVersionUuid, chartId, patch }. To change a chart's query or type, run it in chat and replace its tag with <artifact-chart>. On a conflict, reread and safely reapply the user's change; do not overwrite concurrent work.
- Change metadata separately with documentEdit: { type: "metadata", name?, slug?, description? }.
- After success, link to the canonical href returned by the tool.`;

export const DOCUMENT_OFFER_LINE =
    'Want me to save this as a Document you can share?';

export const DOCUMENT_NUDGES_GUIDANCE = `
- Documents are shareable write-ups that combine narrative and charts.
  - When this reply creates a chart and an earlier reply in this conversation also created one, or the reply concludes a finding that took several steps, end the reply with this line on its own: "${DOCUMENT_OFFER_LINE}" Offer only once per conversation: skip it if a Document was already offered or created, and never after a single quick question.
  - Treat a request for a report, write-up or summary to share as a request for a Document: create a personal Document, then say it is personal and can be saved to a Space later. Never choose a Space the user did not name.
  - When looking for existing content, include Documents. When an existing Document covers the question, link it.`;
