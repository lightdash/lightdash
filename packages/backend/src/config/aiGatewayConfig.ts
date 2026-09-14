import { ParseError } from '@lightdash/common';

export const ANTHROPIC_PUBLIC_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_PUBLIC_API_BASE_URL = `${ANTHROPIC_PUBLIC_BASE_URL}/v1`;

const serializeBaseUrl = (url: URL): string => {
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname === '/' ? '' : pathname}`;
};

export const normalizeLlmGatewayBaseUrl = (
    value: string,
    environmentVariable: string,
): string => {
    const trimmed = value.trim();

    try {
        const url = new URL(trimmed);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            !url.hostname ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
        ) {
            throw new Error('unsupported gateway URL');
        }
        return serializeBaseUrl(url);
    } catch {
        throw new ParseError(
            `Cannot parse environment variable "${environmentVariable}". Value must be an HTTP(S) base URL without credentials, query parameters, or a fragment.`,
            {},
        );
    }
};

/**
 * ANTHROPIC_BASE_URL follows Claude Code's convention: it excludes the API's
 * trailing /v1 segment because Claude Code appends /v1/messages itself.
 * Accept a trailing /v1 for backwards compatibility and normalize it away.
 */
export const normalizeAnthropicGatewayBaseUrl = (value: string): string => {
    const normalized = normalizeLlmGatewayBaseUrl(value, 'ANTHROPIC_BASE_URL');
    const url = new URL(normalized);
    const pathname = url.pathname.replace(/\/v1$/, '');
    url.pathname = pathname || '/';
    return serializeBaseUrl(url);
};

export const getAnthropicApiBaseUrl = (gatewayBaseUrl?: string): string =>
    gatewayBaseUrl
        ? `${normalizeAnthropicGatewayBaseUrl(gatewayBaseUrl)}/v1`
        : ANTHROPIC_PUBLIC_API_BASE_URL;

export const getLlmGatewayHostname = (
    baseUrl: string,
    environmentVariable: string,
): string =>
    new URL(normalizeLlmGatewayBaseUrl(baseUrl, environmentVariable)).hostname;
