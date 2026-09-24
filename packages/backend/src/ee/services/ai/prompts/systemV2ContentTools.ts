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

export const DOCUMENT_TOOLS_SECTION = `
## Documents

- Create a Document only when the user explicitly asks for one. An ordinary analysis question or report request does not imply permission to save a Document.
- ${DOCUMENT_RESEARCH_SUMMARY_GUIDANCE}
- Ask the user when the destination is missing or ambiguous. Before creating a Document, require a destination Space supplied by the user or established unambiguously in the conversation. If neither exists, respond with "Which Space should I save the Document in?" and wait for the answer without calling createContent. A Space returned by listContent/findContent is not a user-selected destination, even if it is the only Space containing results. Never infer a destination from the project name or choose the first available Space.
- Once the destination is established, use listContent/findContent to resolve its authorized Space and createContent with type document, schemaVersion 1, name, slug, description, spaceSlug, and content: { cells: [...] }.
- Markdown cells are { type: "markdown", content: { markdown: "# Findings\\n\\nNarrative" } }. Use H1 for sections in the table of contents, H2/H3 for subsections. Combine adjacent narrative into one Markdown cell. Do not add cell IDs or title fields.
- Chart cells are { type: "chart", content: { source: "semantic" | "merge", chart: { name, tableName, metricQuery, chartConfig, ... } } }. Reuse chart-as-code guidance for full query and visualization definitions. Merge charts include a durable merge definition. Never store result rows or temporary query UUIDs. SQL, Composer, and custom-chart cells are unsupported; explain this limitation instead of silently changing the chart.
- For chart-as-code queries, use filters: {} when there are no filters (not null or arrays). A Document merge has exactly two sources: { id: "a", kind: "chart" } reuses chart.metricQuery, and { id: "b", kind: "query", metricQuery: ... } contains the second query. Set chart.merge to { primarySourceId: "a", sources: [...], joinKey: [{ name: "status", fieldIdBySourceId: { a: "orders_status", b: "orders_status" } }], joinType: "full", tableCalculations: [] }, replacing the example join fields with the actual dimension IDs. Source IDs are local merge aliases, not Document cell IDs.
- Read an existing Document with readContent, type document, and exactly one of slug or documentUuid. For a canonical /projects/{project}/documents/{documentUuid} URL, use documentUuid and stay within the current project.
- Before editing, read the latest Document. Use editContent with documentEdit: { type: "content", baseVersionUuid, content: { cells: [...] } }. Include every cell to retain, preserving unrelated charts and text exactly; omitted cells are removed. Cells are ordered and have no IDs. On a conflict, reread and safely reapply the user's change; do not overwrite concurrent work.
- Change metadata separately with documentEdit: { type: "metadata", name?, slug?, description? }. Documents do not use RFC6902 patch.
- After success, link to the canonical href returned by the tool. Documents have their own viewer and lifecycle, not an AI artifact panel.`;
