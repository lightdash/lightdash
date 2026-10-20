// Shared by the server and the MCP chart view bundle, so it stays free of Node and backend imports.

const escapeHtmlAttribute = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

// Browsers ignore these in a <meta> policy and log a warning for each.
const META_UNSUPPORTED_CSP_DIRECTIVES = new Set([
    'frame-ancestors',
    'report-uri',
    'sandbox',
]);

export const toMetaContentSecurityPolicy = (cspHeader: string): string =>
    cspHeader
        .split(';')
        .map((directive) => directive.trim())
        .filter(
            (directive) =>
                directive.length > 0 &&
                !META_UNSUPPORTED_CSP_DIRECTIVES.has(
                    directive.split(/\s+/)[0].toLowerCase(),
                ),
        )
        .join('; ');

/**
 * The chart view runs the bundle from a blob: URL, so the policy and base URL
 * open the document. The bundle's own doctype becomes an ignored parse error.
 */
export const prepareMcpCustomChartTypeHtml = (
    html: string,
    {
        contentSecurityPolicy,
        baseUrl,
    }: { contentSecurityPolicy: string; baseUrl: string },
): string => {
    // Hosts may drop base-uri for the view, so asset tags carry absolute URLs too.
    const withAbsoluteAssets = html.replace(
        /\b(src|href)="(\.\/[^"]*)"/g,
        (_match, attribute: string, path: string) =>
            `${attribute}="${escapeHtmlAttribute(new URL(path, baseUrl).toString())}"`,
    );
    return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(
        contentSecurityPolicy,
    )}"><base href="${escapeHtmlAttribute(baseUrl)}">${withAbsoluteAssets}`;
};

export type McpCustomChartFrameHtmlResult =
    | { kind: 'html'; html: string }
    | { kind: 'unavailable' };

/** The view fetches the bundle from the user's browser; any failure means the rows table. */
export const fetchMcpCustomChartFrameHtml = async (
    {
        indexUrl,
        contentSecurityPolicy,
    }: { indexUrl: string; contentSecurityPolicy: string | null },
    {
        fetchFn,
        signal,
    }: {
        fetchFn: (url: string, init: RequestInit) => Promise<Response>;
        signal: AbortSignal;
    },
): Promise<McpCustomChartFrameHtmlResult> => {
    if (contentSecurityPolicy === null) return { kind: 'unavailable' };
    try {
        const response = await fetchFn(indexUrl, {
            credentials: 'omit',
            cache: 'no-store',
            signal,
        });
        if (!response.ok) return { kind: 'unavailable' };
        return {
            kind: 'html',
            html: prepareMcpCustomChartTypeHtml(await response.text(), {
                contentSecurityPolicy,
                baseUrl: indexUrl,
            }),
        };
    } catch {
        return { kind: 'unavailable' };
    }
};

export const MCP_CUSTOM_CHART_FRAME_TOOL_NAME = 'get_custom_chart_type_frame';

export type McpCustomChartFrameRequest = {
    projectUuid: string;
    agentUuid: string | null;
    dataAppVizUuid: string;
    version: number;
};

export type McpCustomChartFrameToolCall = (
    params: { name: string; arguments: Record<string, unknown> },
    options: { signal: AbortSignal },
) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Asks the frame tool for a bundle url, then fetches the bundle from it. */
export const loadMcpCustomChartFrameHtml = async (
    request: McpCustomChartFrameRequest,
    {
        callTool,
        fetchFn,
        signal,
    }: {
        // Null when the host cannot proxy tool calls to the server.
        callTool: McpCustomChartFrameToolCall | null;
        fetchFn: (url: string, init: RequestInit) => Promise<Response>;
        signal: AbortSignal;
    },
): Promise<McpCustomChartFrameHtmlResult> => {
    if (callTool === null) return { kind: 'unavailable' };
    try {
        const result = await callTool(
            {
                name: MCP_CUSTOM_CHART_FRAME_TOOL_NAME,
                arguments: {
                    projectUuid: request.projectUuid,
                    ...(request.agentUuid
                        ? { agentUuid: request.agentUuid }
                        : {}),
                    dataAppVizUuid: request.dataAppVizUuid,
                    version: request.version,
                },
            },
            { signal },
        );
        const frame = isRecord(result) ? result.structuredContent : null;
        if (
            !isRecord(result) ||
            result.isError === true ||
            !isRecord(frame) ||
            typeof frame.indexUrl !== 'string' ||
            typeof frame.contentSecurityPolicy !== 'string'
        ) {
            return { kind: 'unavailable' };
        }
        return await fetchMcpCustomChartFrameHtml(
            {
                indexUrl: frame.indexUrl,
                contentSecurityPolicy: frame.contentSecurityPolicy,
            },
            { fetchFn, signal },
        );
    } catch {
        return { kind: 'unavailable' };
    }
};
