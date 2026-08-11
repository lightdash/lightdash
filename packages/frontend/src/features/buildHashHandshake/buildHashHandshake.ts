import { LightdashBuildHashHeader } from '@lightdash/common';

const BUILD_HASH_META_NAME = 'lightdash-build-hash';
const SKEW_RELOAD_KEY = 'lightdash-build-skew-reload';
const RELOAD_COOLDOWN_MS = 60_000;
const MAX_SKEW_RELOADS = 2;

type SkewReloadState = {
    attempts: number;
    lastAttemptAt: number;
};

const NO_SKEW_RELOADS: SkewReloadState = { attempts: 0, lastAttemptAt: 0 };

let skewDetected = false;
let convergenceObserved = false;

const getAppBuildHash = (): string | null => {
    if (typeof document === 'undefined') {
        return null;
    }

    const content = document
        .querySelector(`meta[name="${BUILD_HASH_META_NAME}"]`)
        ?.getAttribute('content');

    return content ? content : null;
};

const clearSkewReloadState = (): boolean => {
    try {
        sessionStorage.removeItem(SKEW_RELOAD_KEY);
        return true;
    } catch {
        return false;
    }
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

    if (serverBuildHash === appBuildHash) {
        if (!convergenceObserved) {
            convergenceObserved = true;
            clearSkewReloadState();
        }
        return;
    }

    skewDetected = true;
};

const parseSkewReloadState = (value: string): SkewReloadState | null => {
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const { attempts, lastAttemptAt } = parsed as Partial<SkewReloadState>;
        if (
            typeof attempts !== 'number' ||
            !Number.isFinite(attempts) ||
            typeof lastAttemptAt !== 'number' ||
            !Number.isFinite(lastAttemptAt)
        ) {
            return null;
        }

        return { attempts, lastAttemptAt };
    } catch {
        return null;
    }
};

const readSkewReloadState = (): SkewReloadState | null => {
    try {
        const stored = sessionStorage.getItem(SKEW_RELOAD_KEY);
        return stored === null ? NO_SKEW_RELOADS : parseSkewReloadState(stored);
    } catch {
        return null;
    }
};

export const refreshForBuildSkew = (): boolean => {
    if (!skewDetected) {
        return false;
    }

    const reloadState = readSkewReloadState();
    if (!reloadState || reloadState.attempts >= MAX_SKEW_RELOADS) {
        return false;
    }

    if (Date.now() - reloadState.lastAttemptAt <= RELOAD_COOLDOWN_MS) {
        return false;
    }

    try {
        sessionStorage.setItem(
            SKEW_RELOAD_KEY,
            JSON.stringify({
                attempts: reloadState.attempts + 1,
                lastAttemptAt: Date.now(),
            }),
        );
    } catch {
        return false;
    }

    window.location.reload();
    return true;
};
