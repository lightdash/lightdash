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

const SCHEDULE_DOWNLOAD_PATTERN =
    /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+\/schedule-download$/;

/**
 * The one allowlisted route whose response triggers a follow-up fetch the app
 * performs OUTSIDE the bridge: the SDK anchor-clicks the returned fileUrl from
 * inside the sandboxed iframe, which cannot attach session cookies. Both
 * mediators stamp `LightdashSignedDownloadHeader` on this route so the backend
 * mints a SIGNED (token/presigned) URL that survives that credential-less
 * fetch.
 */
export const isAppSdkScheduleDownloadRoute = (
    method: string,
    path: string,
): boolean =>
    method.toUpperCase() === 'POST' && SCHEDULE_DOWNLOAD_PATTERN.test(path);

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
        pattern: SCHEDULE_DOWNLOAD_PATTERN,
    },
    // Poll export job status until the backend returns a file URL
    {
        method: 'GET',
        pattern: /^\/api\/v1\/schedulers\/job\/[^/]+\/status$/,
    },
    // Ask the org-approved AI a question about the viewer's own results
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/apps\/[^/]+\/analysis\/prompt$/,
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

// Body and reply of the `APP_SDK_EXPLORE_BASE_TABLE_PATH` virtual route.
export type AppSdkExploreBaseTableRequest = { exploreName: string };

export type AppSdkExploreBaseTableResult = { baseTable: string | null };

export const parseAppSdkExploreBaseTableRequest = (
    body: unknown,
): AppSdkExploreBaseTableRequest | null => {
    if (typeof body !== 'object' || body === null) return null;
    const { exploreName } = body as { exploreName?: unknown };
    return typeof exploreName === 'string' && exploreName.length > 0
        ? { exploreName }
        : null;
};

/** Reads `baseTable` from an explore API body (`{ results: Explore }`). */
export const extractExploreBaseTable = (body: unknown): string | null => {
    if (typeof body !== 'object' || body === null) return null;
    const { results } = body as { results?: unknown };
    if (typeof results !== 'object' || results === null) return null;
    const { baseTable } = results as { baseTable?: unknown };
    return typeof baseTable === 'string' && baseTable.length > 0
        ? baseTable
        : null;
};
