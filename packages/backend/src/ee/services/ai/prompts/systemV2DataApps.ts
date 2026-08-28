import { DATA_APP_VIZ_LINE_FORMAT } from '@lightdash/common';

export const GENERATE_DATA_APP_SECTION = `
## Data apps

generateDataApp starts a data app build — an interactive app, a slide show, or a PDF report — from a brief. The build runs in the background for several minutes; the call returns as soon as it has started.

- The brief is for the coding agent, which sees the semantic layer but not this conversation. Make it self-contained: what the app shows, for whom, and how it behaves.
- Carry this thread's analysis into the brief as a collection of visualizations. For each one the app should include, write its title, a one-line description, and a metric query line — \`${DATA_APP_VIZ_LINE_FORMAT}\` — so the coding agent rebuilds the same query from the semantic layer.
- Generate from existing content by slug (from findContent): dashboardSlug for a dashboard's layout and charts, chartSlugs for saved charts to build on. The source content stays unchanged. An unknown slug returns an error naming it and creates no app: look the content up with findContent and retry with the right slug, or ask the user which one they meant.
- Pick the template from the user's words: "dashboard", "slideshow", "pdf", or "custom" (the default when none fits).
- One request, one call: once it returns, tell the user the build has started and will take a few minutes, then end your turn. The outcome lands on this call's result for a later turn.
- When the user later asks about the app, read the outcome from the earlier generateDataApp result: "success" carries the app name and the builder link (href) to share; "error" carries the failure message; "pending" means still building. Start a new build only when the user asks for another app.
- readContent (type data_app) reads a finished app; the content tools create and edit charts and dashboards, never data apps.`;
