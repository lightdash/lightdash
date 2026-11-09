import {
    type ApiError,
    type MobileAppLink,
    type MobileAppLinkStatus,
} from '@lightdash/common';
import { useDocumentVisibility } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const MOBILE_APP_LINK_POLL_INTERVAL_MS = 2000;

const useNow = (isTicking: boolean) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!isTicking) return undefined;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [isTicking]);
    return now;
};

export const useMobileAppLink = () => {
    const lightdashApi = useLightdashApi();
    const isVisible = useDocumentVisibility() === 'visible';

    const mint = useMutation<MobileAppLink, ApiError>(() =>
        lightdashApi<MobileAppLink>({
            url: '/user/mobile/app-links',
            method: 'POST',
            body: undefined,
        }),
    );
    const link = mint.data ?? null;

    const status = useQuery<MobileAppLinkStatus, ApiError>(
        ['mobile-app-link-status', link?.linkUuid],
        () =>
            lightdashApi<MobileAppLinkStatus>({
                url: `/user/mobile/app-links/${link?.linkUuid}`,
                method: 'GET',
                body: undefined,
            }),
        {
            enabled: link !== null && isVisible,
            refetchInterval: (data) =>
                data?.scannedAt ? false : MOBILE_APP_LINK_POLL_INTERVAL_MS,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            retry: false,
        },
    );
    const scannedAt = status.data?.scannedAt ?? null;
    const isScanned = scannedAt !== null;

    const now = useNow(isVisible && link !== null && !isScanned);
    const expiresAtMs = link ? Date.parse(link.expiresAt) : null;
    const isExpired = expiresAtMs !== null && now >= expiresAtMs;

    const { mutate, isLoading: isMinting, isError: isMintError } = mint;
    const requestedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!isVisible || isScanned || isMinting || isMintError) return;
        if (link !== null && !isExpired) return;
        const request = link?.linkUuid ?? 'first';
        if (requestedFor.current === request) return;
        requestedFor.current = request;
        mutate();
    }, [isVisible, isScanned, isMinting, isMintError, link, isExpired, mutate]);

    return {
        link,
        isScanned,
        remainingSeconds:
            expiresAtMs === null
                ? null
                : Math.max(0, Math.ceil((expiresAtMs - now) / 1000)),
        isMinting: isMinting && link === null,
        mintError: mint.error ?? null,
        retry: () => {
            requestedFor.current = null;
            mutate();
        },
    };
};
