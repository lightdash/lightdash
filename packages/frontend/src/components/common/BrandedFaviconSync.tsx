import { useEffect, type FC } from 'react';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';

const DEFAULT_FAVICON_URL = '/favicon.ico';

const isSameOrigin = (url: string) => {
    try {
        return (
            new URL(url, window.location.origin).origin ===
            window.location.origin
        );
    } catch {
        return false;
    }
};

export const BrandedFaviconSync: FC = () => {
    const { logoUrl, isResolved } = useWhiteLabelBrand();
    const isEmbedded = useIsEmbedded();

    useEffect(() => {
        if (isEmbedded || !isResolved) return undefined;
        const links = Array.from(
            document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
        );
        const originalHrefs = links.map((link) => link.getAttribute('href'));
        const apply = (href: string) =>
            links.forEach((link) => link.setAttribute('href', href));
        let objectUrl: string | null = null;
        let cancelled = false;

        if (!logoUrl) {
            apply(DEFAULT_FAVICON_URL);
        } else if (!isSameOrigin(logoUrl)) {
            apply(logoUrl);
        } else {
            // Favicon requests don't reliably send cookies, and uploaded logos need auth.
            fetch(logoUrl, { credentials: 'same-origin' })
                .then((response) =>
                    response.ok ? response.blob() : Promise.reject(),
                )
                .then((blob) => {
                    if (cancelled) return;
                    objectUrl = URL.createObjectURL(blob);
                    apply(objectUrl);
                })
                .catch(() => {
                    if (!cancelled) apply(logoUrl);
                });
        }

        return () => {
            cancelled = true;
            links.forEach((link, index) =>
                link.setAttribute('href', originalHrefs[index] ?? ''),
            );
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [logoUrl, isResolved, isEmbedded]);

    return null;
};
