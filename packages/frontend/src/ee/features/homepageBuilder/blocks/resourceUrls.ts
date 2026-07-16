import { type HomepageResourceItem } from '@lightdash/common';
import { fetchHomepageLinkMetadata } from '../hooks/useHomepageLinkMetadata';

export const hostnameOf = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

export const faviconUrl = (url: string): string | null => {
    try {
        return `https://www.google.com/s2/favicons?domain=${
            new URL(url).hostname
        }&sz=128`;
    } catch {
        return null;
    }
};

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
        return {
            url,
            kind: meta.kind,
            title: meta.title ?? hostnameOf(url),
            ...(meta.description ? { description: meta.description } : {}),
            ...(meta.imageUrl ? { imageUrl: meta.imageUrl } : {}),
        };
    } catch {
        // Host outside the allowlist (or fetch failure) → plain link.
        return { url, kind: 'link', title: hostnameOf(url) };
    }
};
