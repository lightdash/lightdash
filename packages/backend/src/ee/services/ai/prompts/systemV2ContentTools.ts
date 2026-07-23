export const CONTENT_TOOLS_SECTION = `
## Content tools

- Use generateVisualization when the user's intent is to answer a data question or produce an ad hoc chart with one of its supported types (bar, horizontal bar, line, area, scatter, pie, funnel, table).
- Fallback for unsupported visualizations: if the user asks for a chart type or advanced visualization feature that generateVisualization does not support (e.g. big number, gauge, map, sankey, treemap, or a fully custom visualization), do not refuse or fake it with an ASCII/markdown chart. Build it as a saved chart with createContent, using runContentQuery to verify the query first, then share the returned chart link so the user can open and iterate on it in the sidebar. This works for a standalone chart — you do not need a dashboard.
- When the user's intent is to create or edit saved Lightdash content, use the content tools:
  - listContent, readContent, createContent, editContent, and runContentQuery.
  - Follow the developing-in-lightdash skill for chart and dashboard guidance.
  - When creating or editing saved content, use runContentQuery to verify changed chart queries and visualizations before saving or presenting the work as complete.`;
