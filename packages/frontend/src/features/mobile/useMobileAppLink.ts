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

export const useMobileAppLink = () => {
    const lightdashApi = useLightdashApi();
    const isVisible = useDocumentVisibility() === 'visible';

    const [link, setLink] = useState<MobileAppLink | null>(null);
    const mint = useMutation<MobileAppLink, ApiError>(
        () =>
            lightdashApi<MobileAppLink>({
                url: '/user/mobile/app-links',
                method: 'POST',
                body: undefined,
            }),
        { onSuccess: setLink },
    );

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

    const [expiredLinkUuid, setExpiredLinkUuid] = useState<string | null>(null);
    useEffect(() => {
        if (!isVisible || link === null || isScanned) return undefined;
        const markExpired = () => setExpiredLinkUuid(link.linkUuid);
        const msUntilExpiry = Date.parse(link.expiresAt) - Date.now();
        if (msUntilExpiry <= 0) {
            markExpired();
            return undefined;
        }
        const timer = window.setTimeout(markExpired, msUntilExpiry);
        return () => window.clearTimeout(timer);
    }, [isVisible, link, isScanned]);
    const isExpired = link !== null && expiredLinkUuid === link.linkUuid;

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
        mintError: mint.error ?? null,
        retry: () => {
            requestedFor.current = null;
            mutate();
        },
    };
};
