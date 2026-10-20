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
