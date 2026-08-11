import { LightdashBuildHashHeader } from '@lightdash/common';

const BUILD_HASH_META_NAME = 'lightdash-build-hash';
const SKEW_RELOAD_KEY = 'lightdash-build-skew-reload';
const RELOAD_COOLDOWN_MS = 60_000;

let skewDetected = false;

const getAppBuildHash = (): string | null => {
    if (typeof document === 'undefined') {
        return null;
    }

    const content = document
        .querySelector(`meta[name="${BUILD_HASH_META_NAME}"]`)
        ?.getAttribute('content');

    return content ? content : null;
};

export const recordServerBuildHash = (response: Response): void => {
    if (skewDetected) {
        return;
    }

    const serverBuildHash = response.headers.get(LightdashBuildHashHeader);
    if (!serverBuildHash) {
        return;
    }

    const appBuildHash = getAppBuildHash();
    if (!appBuildHash) {
        return;
    }

    skewDetected = serverBuildHash !== appBuildHash;
};

const hasRecentSkewReload = (): boolean => {
    try {
        const reloadTimestamp = sessionStorage.getItem(SKEW_RELOAD_KEY);
        if (!reloadTimestamp) {
            return false;
        }

        const reloadTime = parseInt(reloadTimestamp, 10);
        if (
            Number.isNaN(reloadTime) ||
            Date.now() - reloadTime > RELOAD_COOLDOWN_MS
        ) {
            sessionStorage.removeItem(SKEW_RELOAD_KEY);
            return false;
        }

        return true;
    } catch {
        return true;
    }
};

export const refreshForBuildSkew = (): boolean => {
    if (!skewDetected || hasRecentSkewReload()) {
        return false;
    }

    try {
        sessionStorage.setItem(SKEW_RELOAD_KEY, Date.now().toString());
    } catch {
        return false;
    }

    window.location.reload();
    return true;
};
