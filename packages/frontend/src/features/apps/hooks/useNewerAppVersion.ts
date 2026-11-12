import { DATA_APP_NEWER_VERSION_CODE, type ApiError } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';

const isNewerAppVersionError = (error: ApiError | null | undefined): boolean =>
    error?.error?.data?.code === DATA_APP_NEWER_VERSION_CODE;

type Args = {
    /** The version being shown. */
    version: number | undefined;
    tokenError: ApiError | null;
    /** Reloads the app so the latest ready version is known. */
    refetchApp: () => unknown;
};

/**
 * Tracks the backend refusing the shown version because a newer one is ready.
 * Refetches the app once per version, so a host that follows the latest ready
 * version moves on to it.
 */
export const useNewerAppVersion = ({
    version,
    tokenError,
    refetchApp,
}: Args) => {
    const [outdatedVersion, setOutdatedVersion] = useState<number>();
    const refetchedFor = useRef<number | undefined>(undefined);

    const onNewerVersion = useCallback(() => {
        if (version === undefined || refetchedFor.current === version) return;
        refetchedFor.current = version;
        setOutdatedVersion(version);
        void refetchApp();
    }, [version, refetchApp]);

    const isTokenOutdated = isNewerAppVersionError(tokenError);
    useEffect(() => {
        if (isTokenOutdated) onNewerVersion();
    }, [isTokenOutdated, onNewerVersion]);

    return {
        onNewerVersion,
        isOutdated:
            isTokenOutdated ||
            (version !== undefined && outdatedVersion === version),
    };
};
