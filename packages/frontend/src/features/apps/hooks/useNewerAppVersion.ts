import { DATA_APP_NEWER_VERSION_CODE, type ApiError } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';

const isNewerAppVersionError = (error: ApiError | null | undefined): boolean =>
    error?.error?.data?.code === DATA_APP_NEWER_VERSION_CODE;

type Args = {
    appUuid: string | undefined;
    /** The version being shown. */
    version: number | undefined;
    tokenError: ApiError | null;
    /** Reloads the app so the latest ready version is known. */
    refetchApp: () => unknown;
};

/**
 * Tracks the backend refusing the shown version because a newer one is ready.
 * Refetches the app once per app version, so a host that follows the latest
 * ready version moves on to it.
 */
export const useNewerAppVersion = ({
    appUuid,
    version,
    tokenError,
    refetchApp,
}: Args) => {
    // Keyed by app too: the page is reused when the route moves to another app.
    const shown =
        appUuid !== undefined && version !== undefined
            ? `${appUuid}:${version}`
            : undefined;
    const [outdated, setOutdated] = useState<string>();
    const refetchedFor = useRef<string | undefined>(undefined);

    const onNewerVersion = useCallback(() => {
        if (shown === undefined || refetchedFor.current === shown) return;
        refetchedFor.current = shown;
        setOutdated(shown);
        void refetchApp();
    }, [shown, refetchApp]);

    const isTokenOutdated = isNewerAppVersionError(tokenError);
    useEffect(() => {
        if (isTokenOutdated) onNewerVersion();
    }, [isTokenOutdated, onNewerVersion]);

    return {
        onNewerVersion,
        isOutdated:
            isTokenOutdated || (shown !== undefined && outdated === shown),
    };
};
