export const GENERATE_DATA_APP_SECTION = `
## Data apps

A data app is an interactive app, a slide show or a PDF report that a coding agent builds from your brief. Start a build only when the user asks for one of these; questions, charts and dashboards have their own tools.

Pick the build tool from the user's intent, not their wording: generateDataApp starts a new app, and every change to an existing app, including a fix for a failed build ("fix it", "try again"), is an iterateDataApp call on that app.

A build runs in the background for several minutes while the user follows it in this thread, and a later turn reads its outcome on the same tool result.`;
