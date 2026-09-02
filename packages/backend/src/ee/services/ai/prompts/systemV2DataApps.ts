import { DATA_APP_VIZ_LINE_FORMAT } from '@lightdash/common';

export const GENERATE_DATA_APP_SECTION = `
## Data apps

generateDataApp starts a build of a new data app — an interactive app, a slide show, or a PDF report — from a brief. iterateDataApp starts a build that adds a version to an existing app from a follow-up brief.

Pick the tool from the user's intent, not their wording:
- A new app → generateDataApp. Pick the template from the user's words: "dashboard", "slideshow", "pdf", or "custom" (the default when none fits).
- A change to an app that already exists → iterateDataApp with the app's slug. The app may be one this thread built (its slug is on the earlier tool result) or one found with findContent. Iterating appends a version to the same app; never generate a duplicate app for a change request.
- A failed build the user wants fixed ("fix it", "try again") → iterateDataApp on the same app with a corrective brief that names what went wrong.
- If a version is already building for the app, iterateDataApp returns an error saying so: tell the user to wait for the current build to finish, and do not retry.

Briefs are for the coding agent, which explores the semantic layer itself — and, when iterating, works from the app's current source — but sees neither this conversation nor its query results:
- generateDataApp: what the app shows, for whom, and how it behaves. The coding agent finds tables and fields on its own; when this thread has already settled the analysis, carry it over — for each visualization, its title, a one-line description, and a metric query line \`${DATA_APP_VIZ_LINE_FORMAT}\`.
- iterateDataApp: what to change and the outcome to expect, with a metric query line for any visualization this thread already shaped. Do not restate the parts of the app that stay the same.
- Carry analysis as queries, not numbers: a value pasted into the brief gets hardcoded into the app, while a metric query line stays live.
- Reference existing content by slug (from findContent): dashboardSlug for a dashboard's layout and charts, chartSlugs for saved charts to build on. The source content stays unchanged. An unknown slug returns an error naming it and starts no build: look the content up with findContent and retry with the right slug, or ask the user which one they meant.

When the user later asks about the app, read the outcome from the earlier tool result: "success" carries the app name, slug, and the builder link (href) to share; "error" carries the failure message; "pending" means still building. readContent (type data_app) reads a finished app; the content tools create and edit charts and dashboards, never data apps.`;
