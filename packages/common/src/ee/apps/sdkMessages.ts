// Import-free so browser bundles can deep-import it without the common barrel.

// postMessage type the host uses to push render context into the sandboxed
// iframe over the existing app SDK bridge (no new transport).
export const APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE =
    'lightdash:sdk:data-app-viz-context';

// postMessage type the iframe posts on mount (via the SDK's useVizContext) to
// ask the host to push the current context — the renderer may mount after the
// host's first push, so this handshake replaces blind timed re-sends.
export const APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE =
    'lightdash:sdk:viz-context-request';

// The light/dark mode an app iframe renders in: the host's resolved Mantine
// scheme, or the embed's `?theme=`.
export type AppColorScheme = 'light' | 'dark';

// postMessage type the host uses to tell a running app which color scheme to
// render in. Also seeded into the iframe URL hash as `theme=` so the SDK can
// apply the right scheme before the app's first render.
export const APP_SDK_COLOR_SCHEME_MESSAGE = 'lightdash:sdk:theme';

// Posted by the app's SDK once its theme listener is live, so the host replies
// with the current scheme instead of the app depending on having been listening
// when the load-time push went out.
export const APP_SDK_COLOR_SCHEME_REQUEST_MESSAGE =
    'lightdash:sdk:theme-request';

// Host → iframe: releases the SDK's postMessage transports.
export const APP_SDK_READY_MESSAGE = 'lightdash:sdk:ready';

// Iframe → host: the SDK version and feature keys the bundle was built with.
export const APP_SDK_MANIFEST_MESSAGE = 'lightdash:sdk:manifest';

// Iframe → host: a chart type painted the last pushed viz context.
export const APP_SDK_VIZ_RENDERED_MESSAGE = 'lightdash:sdk:viz-rendered';
