import { useEffect } from 'react';
import { navigateTo } from '../utils/navigation';

const STORE_REDIRECT_DELAY_MS = 1500;

type Args = {
    /** Built from the validated params, never from the incoming query string. */
    schemeUrl: string | null;
    /** The store for this platform, or null when there is no listing yet. */
    storeUrl: string | null;
    /** False on desktop and on a user agent we could not place. */
    enabled: boolean;
};

/**
 * Tries the app, then falls through to the store. A browser that blocks the
 * scheme, or a visitor we are not confident about, just sees the buttons.
 */
export const useMobileSetupAutoOpen = ({
    schemeUrl,
    storeUrl,
    enabled,
}: Args) => {
    useEffect(() => {
        if (!enabled || !schemeUrl) return;

        navigateTo(schemeUrl);

        if (!storeUrl) return;

        const timer = setTimeout(() => {
            // A hidden page is one the app almost certainly took over.
            if (document.hidden) return;
            navigateTo(storeUrl);
        }, STORE_REDIRECT_DELAY_MS);

        return () => clearTimeout(timer);
    }, [enabled, schemeUrl, storeUrl]);
};
