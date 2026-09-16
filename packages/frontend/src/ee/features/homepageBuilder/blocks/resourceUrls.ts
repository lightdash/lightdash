import { type HomepageResourceItem } from '@lightdash/common';
import { fetchHomepageLinkMetadata } from '../hooks/useHomepageLinkMetadata';

export const hostnameOf = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

// Don't leak non-public hostnames (intranet links, IP literals) to Google.
const isPublicHostname = (hostname: string): boolean =>
    hostname.includes('.') &&
    !hostname.includes(':') &&
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) &&
    !/\.(local|internal|localhost)$/i.test(hostname);

export const faviconUrl = (url: string): string | null => {
    try {
        const { hostname } = new URL(url);
        if (!isPublicHostname(hostname)) return null;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
    } catch {
        return null;
    }
};

// Claude serves this one branded card for artifacts it has no preview of, so
// it says nothing about the item and the favicon tile reads better.
const GENERIC_CLAUDE_CARD = 'https://claude.ai/images/claude_ogimage.png';

// Config is API-writable, so only https images are ever used as <img> sources.
export const safeImageUrl = (url: string | null | undefined): string | null =>
    url?.startsWith('https://') && url !== GENERIC_CLAUDE_CARD ? url : null;

const normalizeUrl = (raw: string): string =>
    /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

// A pasted token is only treated as a resource if it looks like a URL — either
// an explicit scheme or a bare `host.tld/…`. Keeps prose words out of the batch.
export const looksLikeUrl = (token: string): boolean =>
    /^https?:\/\//i.test(token) ||
    /^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(token);

export const resolveResourceUrl = async (
    projectUuid: string,
    rawUrl: string,
): Promise<HomepageResourceItem> => {
    const url = normalizeUrl(rawUrl.trim());
    try {
        const meta = await fetchHomepageLinkMetadata(projectUuid, url);
        const imageUrl = safeImageUrl(meta.imageUrl);
        const title = meta.title ?? hostnameOf(url);
        // Providers without a description echo the title into og:description.
        const description =
            meta.description && meta.description !== title
                ? meta.description
                : null;
        return {
            url,
            kind: meta.kind,
            title,
            ...(description ? { description } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        };
    } catch {
        // Host outside the allowlist (or fetch failure) → plain link.
        return { url, kind: 'link', title: hostnameOf(url) };
    }
};
