import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { validate as isValidUuid } from 'uuid';

/**
 * Redirects slug-based URLs to UUID-based URLs after initial resource load.
 *
 * When a page loads with a slug in the URL (e.g., /dashboards/my-dashboard-slug),
 * this hook replaces the slug with the resolved UUID once the resource is loaded.
 * This ensures all subsequent API calls (edit, patch, async queries) use the
 * unambiguous UUID instead of the potentially-colliding slug.
 *
 * Uses `navigate({ replace: true })` so the slug URL doesn't appear in browser history.
 */
export function useSlugRedirect(
    urlParam: string | undefined,
    resolvedUuid: string | undefined,
) {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!urlParam || !resolvedUuid) return;
        if (urlParam === resolvedUuid) return;
        if (isValidUuid(urlParam)) return;

        const newPath = location.pathname.replace(urlParam, resolvedUuid);
        void navigate(newPath + location.search + location.hash, {
            replace: true,
        });
    }, [urlParam, resolvedUuid, navigate, location]);
}
