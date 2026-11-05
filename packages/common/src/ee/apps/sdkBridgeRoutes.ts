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

const METRIC_QUERY_PATTERN =
    /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/;

/**
 * The route whose request body carries a full metric query — the preview
 * proxy taps it to compile and show the SQL behind each query (--show-sql).
 */
export const isAppSdkMetricQueryRoute = (
    method: string,
    path: string,
): boolean =>
    method.toUpperCase() === 'POST' && METRIC_QUERY_PATTERN.test(path);

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
        pattern: METRIC_QUERY_PATTERN,
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

// Body and reply of the `APP_SDK_SPACE_CHARTS_PATH` virtual route.

/** A space referenced the way app code knows it: by slug or uuid. */
export type AppSdkSpaceChartsRequest = { space: string };

/** The chart fields an app may see — a subset of `SpaceQuery`, nothing
 *  viewer-specific and no access data. */
export type AppSdkSpaceChartsChart = {
    uuid: string;
    name: string;
    description: string | null;
    chartKind: string | null;
    slug: string | null;
    updatedAt: string | null;
};

export type AppSdkSpaceChartsResult = {
    /** Null when the space doesn't exist or the viewer can't access it —
     *  deliberately indistinguishable, so apps can't probe for spaces. */
    space: { uuid: string; name: string; slug: string } | null;
    charts: AppSdkSpaceChartsChart[];
};

export const parseAppSdkSpaceChartsRequest = (
    body: unknown,
): AppSdkSpaceChartsRequest | null => {
    if (typeof body !== 'object' || body === null) return null;
    const { space } = body as { space?: unknown };
    return typeof space === 'string' && space.trim().length > 0
        ? { space: space.trim() }
        : null;
};

/**
 * Match a slug-or-uuid space reference against a spaces list body
 * (`{ results: SpaceSummary[] }`). The list endpoint already returns only
 * the spaces the viewer can access, so a miss means "not for you" as much
 * as "doesn't exist".
 */
export const resolveAppSdkSpaceUuid = (
    spacesListBody: unknown,
    ref: string,
): string | null => {
    if (typeof spacesListBody !== 'object' || spacesListBody === null)
        return null;
    const { results } = spacesListBody as { results?: unknown };
    if (!Array.isArray(results)) return null;
    const match = results.find((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return false;
        const { uuid, slug } = entry as { uuid?: unknown; slug?: unknown };
        return uuid === ref || slug === ref;
    }) as { uuid?: unknown } | undefined;
    return typeof match?.uuid === 'string' ? match.uuid : null;
};

const toNullableString = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Trim a space detail body (`{ results: Space }`) to what an app may see:
 * the space identity and its saved-chart summaries. Access entries, member
 * lists, dashboards and child spaces never leave the host.
 */
export const extractAppSdkSpaceCharts = (
    spaceBody: unknown,
): AppSdkSpaceChartsResult | null => {
    if (typeof spaceBody !== 'object' || spaceBody === null) return null;
    const { results } = spaceBody as { results?: unknown };
    if (typeof results !== 'object' || results === null) return null;
    const { uuid, name, slug, queries } = results as {
        uuid?: unknown;
        name?: unknown;
        slug?: unknown;
        queries?: unknown;
    };
    if (
        typeof uuid !== 'string' ||
        typeof name !== 'string' ||
        typeof slug !== 'string'
    ) {
        return null;
    }
    const charts: AppSdkSpaceChartsChart[] = (
        Array.isArray(queries) ? queries : []
    ).flatMap((query: unknown) => {
        if (typeof query !== 'object' || query === null) return [];
        const chart = query as Record<string, unknown>;
        if (typeof chart.uuid !== 'string' || typeof chart.name !== 'string') {
            return [];
        }
        return [
            {
                uuid: chart.uuid,
                name: chart.name,
                description: toNullableString(chart.description),
                chartKind: toNullableString(chart.chartKind),
                slug: toNullableString(chart.slug),
                updatedAt: toNullableString(chart.updatedAt),
            },
        ];
    });
    return { space: { uuid, name, slug }, charts };
};

/** The uniform "nothing to show" answer for a missing/inaccessible space. */
export const emptyAppSdkSpaceCharts = (): AppSdkSpaceChartsResult => ({
    space: null,
    charts: [],
});
