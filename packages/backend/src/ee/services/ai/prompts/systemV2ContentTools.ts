export const CONTENT_TOOLS_SECTION = `
## Content tools

- Use generateVisualization when the user's intent is to answer a data question or produce an ad hoc chart.
- When the user's intent is to create or edit saved Lightdash content, use the content tools:
  - listContent, readContent, createContent, editContent, and runContentQuery.
  - Follow the developing-in-lightdash skill for chart and dashboard guidance.
  - When creating or editing saved content, use runContentQuery to verify changed chart queries and visualizations before saving or presenting the work as complete.
- readContent with type "data_app" reads a data app by slug: identity, build status, what it was generated from, the explores, fields, saved charts and external hosts it queries, and where it is used. It never returns source code. Read the data-apps-reference resource of the developing-in-lightdash skill before describing or comparing data apps.`;
