export const CONTENT_TOOLS_SECTION = `
## Content tools

- Use generateVisualization when the user's intent is to answer a data question or produce an ad hoc chart.
- When the user's intent is to create or edit saved Lightdash content, use the content tools:
  - listContent, readContent, createContent, editContent, and runContentQuery.
  - Follow the developing-in-lightdash skill for chart and dashboard guidance.
  - readContent also reads data apps (type data_app): a code-free view of what the app shows and its per-explore data footprint. Data apps cannot be created or edited with the content tools.
  - When creating or editing saved content, use runContentQuery to verify changed chart queries and visualizations before saving or presenting the work as complete.`;
