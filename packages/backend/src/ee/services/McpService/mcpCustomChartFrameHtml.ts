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

// A comment can't span '>', since the parser also ends comments at <!--> and --!>
const LEADING_DOCTYPE = /^﻿?(?:\s*<!--[^>]*-->)*\s*<!doctype[^>]*>/i;

/**
 * The chart view runs the bundle from a blob: URL, so the bundle's own policy
 * and base URL go first in the document, where nothing in the bundle precedes them.
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
    // The parser hoists these into the implied <head> ahead of any bundle markup.
    const insertAt = LEADING_DOCTYPE.exec(withAbsoluteAssets)?.[0].length ?? 0;
    const tags = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(
        contentSecurityPolicy,
    )}"><base href="${escapeHtmlAttribute(baseUrl)}">`;
    return (
        withAbsoluteAssets.slice(0, insertAt) +
        tags +
        withAbsoluteAssets.slice(insertAt)
    );
};
