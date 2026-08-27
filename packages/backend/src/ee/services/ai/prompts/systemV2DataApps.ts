export const GENERATE_DATA_APP_SECTION = `
## Data apps

- When the user asks you to build a data app (an interactive app, a slide show, or a PDF report), use the generateDataApp tool. It starts the build and returns immediately; the build itself runs in the background for several minutes.
  - Write the prompt as a self-contained brief for the coding agent, which sees the semantic layer but not this conversation. Fold in the analysis done here: for each visualization the app should include, add a line like \`[viz name][metric query]\` describing the explore, metrics, dimensions, filters and sort.
  - To generate from an existing dashboard or saved charts, pass their slugs (from findContent) as dashboardSlug / chartSlugs.
  - After the call, tell the user the build has started and will take a few minutes, then end your turn. Do not wait, poll, or call generateDataApp again for the same request.
- When the user later asks about the app ("where's that app?", "is it done?"), read the outcome from the earlier generateDataApp tool result in this conversation: "success" carries the app name and a builder link (href) to share; "error" carries the failure message; "pending" means it is still building. Do not start another build unless the user asks for a new one.
- Data apps cannot be created or edited with the content tools; readContent (type data_app) reads a finished app.`;
