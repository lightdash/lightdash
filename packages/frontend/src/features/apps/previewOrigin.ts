import useApp from '../../providers/App/useApp';

// Duplicated from api.ts / sdk/index.tsx — those keep it as a private
// constant; threading a shared export through the SDK build is more churn
// than warranted for a three-line dep. Keep these in sync.
const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

/**
 * Origin where data-app preview iframes load. Resolution order:
 *   1. Explicit `dataApps.previewOrigin` from the backend health endpoint
 *      (set in prod when previews are served from a dedicated subdomain).
 *   2. The SDK-stored instance URL — in SDK embeds the page origin is the
 *      *consuming app's* origin, not Lightdash. Without this fallback the
 *      iframe would try to load app assets from the host dev server.
 *   3. The page's own origin — correct for in-app rendering and the
 *      iframe-embed flow (the page is already served by Lightdash).
 */
export const usePreviewOrigin = (): string => {
    const { health } = useApp();
    if (health.data?.dataApps.previewOrigin) {
        return health.data.dataApps.previewOrigin;
    }
    const sdkInstanceUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    if (sdkInstanceUrl) {
        // SDK persists with a trailing slash; strip to match origin shape.
        return sdkInstanceUrl.replace(/\/$/, '');
    }
    return window.location.origin;
};
