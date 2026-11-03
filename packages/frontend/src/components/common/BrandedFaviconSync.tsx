import { useEffect, type FC } from 'react';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { pickBrandLogo } from '../../hooks/organization/brandLogos';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';

export const BrandedFaviconSync: FC = () => {
    const { brand, isResolved } = useWhiteLabelBrand();
    const isEmbedded = useIsEmbedded();
    const logoUrl = brand ? (pickBrandLogo(brand.logos)?.url ?? null) : null;

    useEffect(() => {
        if (isEmbedded) return undefined;
        const links = Array.from(
            document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
        );
        const originalHrefs = links.map((link) => link.getAttribute('href'));
        const apply = (href: string) =>
            links.forEach((link) => link.setAttribute('href', href));
        let objectUrl: string | null = null;
        let cancelled = false;

        if (!isResolved || logoUrl) {
            apply('/favicon-neutral.svg');
        } else if (!logoUrl) {
            links.forEach((link) =>
                link.setAttribute(
                    'href',
                    link.dataset.defaultHref ?? '/favicon.ico',
                ),
            );
        }

        // Favicon requests don't reliably send cookies, and uploaded logos need auth.
        if (logoUrl) {
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
