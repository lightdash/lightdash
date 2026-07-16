import { ParameterError, type HomepageResourceKind } from '@lightdash/common';

/**
 * Pure helpers for the homepage link-metadata endpoint: URL classification and
 * OpenGraph / YouTube-oEmbed parsing. No network calls live here so the parsing
 * is unit-testable against fixtures.
 */

export type ResourceProvider =
    | { kind: 'claude'; fetchKind: 'html'; fetchUrl: string }
    | { kind: 'youtube'; fetchKind: 'oembed'; fetchUrl: string };

const isHostOrSubdomain = (hostname: string, domain: string): boolean =>
    hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * SSRF host allowlist. Only well-known public providers are reachable; every
 * other host is rejected so this endpoint can never be pointed at internal
 * infrastructure. Returns what to fetch and how to parse it.
 */
export const classifyResourceUrl = (rawUrl: string): ResourceProvider => {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new ParameterError('Invalid URL');
    }
    if (parsed.protocol !== 'https:') {
        throw new ParameterError('Only https URLs are supported');
    }
    const host = parsed.hostname.toLowerCase();

    if (isHostOrSubdomain(host, 'claude.ai')) {
        return {
            kind: 'claude',
            fetchKind: 'html',
            fetchUrl: parsed.toString(),
        };
    }
    if (isHostOrSubdomain(host, 'youtube.com') || host === 'youtu.be') {
        const oembed = new URL('https://www.youtube.com/oembed');
        oembed.searchParams.set('url', parsed.toString());
        oembed.searchParams.set('format', 'json');
        return {
            kind: 'youtube',
            fetchKind: 'oembed',
            fetchUrl: oembed.toString(),
        };
    }
    throw new ParameterError(
        'Only Claude Artifact and YouTube links can be unfurled',
    );
};

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
};

const decodeEntities = (value: string): string =>
    value.replace(
        /&(?:amp|lt|gt|quot|nbsp|#39|#x27);/gi,
        (match) => HTML_ENTITIES[match.toLowerCase()] ?? match,
    );

const readMeta = (html: string, key: string): string | null => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Handle both attribute orders: property-then-content and content-then-property.
    const patterns = [
        new RegExp(
            `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
            'i',
        ),
        new RegExp(
            `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
            'i',
        ),
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeEntities(match[1].trim());
    }
    return null;
};

export type ParsedLinkMetadata = {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
};

/** Parse OpenGraph tags from an HTML document, falling back to <title>. */
export const parseOpenGraph = (html: string): ParsedLinkMetadata => {
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    return {
        title:
            readMeta(html, 'og:title') ??
            (titleTag ? decodeEntities(titleTag.trim()) : null),
        description: readMeta(html, 'og:description'),
        imageUrl: readMeta(html, 'og:image'),
    };
};

/** Parse a YouTube oEmbed JSON response. */
export const parseYoutubeOembed = (raw: unknown): ParsedLinkMetadata => {
    if (typeof raw !== 'object' || raw === null) {
        return { title: null, description: null, imageUrl: null };
    }
    const data = raw as Record<string, unknown>;
    const asString = (value: unknown): string | null =>
        typeof value === 'string' && value.length > 0 ? value : null;
    return {
        title: asString(data.title),
        // oEmbed has no description; surface the channel as a subtle subtitle.
        description: asString(data.author_name),
        imageUrl: asString(data.thumbnail_url),
    };
};

export const resourceKindForProvider = (
    provider: ResourceProvider,
): HomepageResourceKind => provider.kind;
