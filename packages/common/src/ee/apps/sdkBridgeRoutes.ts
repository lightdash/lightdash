/**
 * The API routes a data app is allowed to reach, shared by the two places
 * that mediate app traffic so their authority can never drift apart:
 *
 * - the in-product postMessage bridge (`useAppSdkBridge`), where deployed
 *   apps run credential-less in a sandboxed iframe
 * - the CLI preview proxy (`lightdash apps preview`), where the same app
 *   code runs on a local vite page against the developer's credential
 *
 * Everything not matched here is rejected by both.
 */
export type AppSdkAllowedRoute = {
    method: 'GET' | 'POST';
    pattern: RegExp;
};

export const APP_SDK_ALLOWED_ROUTES: AppSdkAllowedRoute[] = [
    // Async metric query execution
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/,
    },
    // Run a saved chart live by UUID (linked charts)
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/chart$/,
    },
    // Run underlying-data queries for SDK result rows
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/underlying-data$/,
    },
    // Poll for query results
    {
        method: 'GET',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+$/,
    },
    // Schedule backend CSV/XLSX export jobs for SDK query results
    {
        method: 'POST',
        pattern:
            /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+\/schedule-download$/,
    },
    // Poll export job status until the backend returns a file URL
    {
        method: 'GET',
        pattern: /^\/api\/v1\/schedulers\/job\/[^/]+\/status$/,
    },
    // Get current user
    { method: 'GET', pattern: /^\/api\/v1\/user$/ },
];

export const isAllowedAppSdkRoute = (method: string, path: string): boolean =>
    APP_SDK_ALLOWED_ROUTES.some(
        (route) =>
            route.method === method.toUpperCase() && route.pattern.test(path),
    );

/**
 * Project uuid embedded in an app-SDK API path, or null for the routes that
 * aren't project-scoped (scheduler job status, current user). Callers that
 * pin preview traffic to one project compare this against their target.
 */
export const extractAppSdkRouteProjectUuid = (path: string): string | null => {
    const match = path.match(/^\/api\/v2\/projects\/([^/]+)\//);
    return match ? match[1] : null;
};
