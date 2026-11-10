import {
    type ApiError,
    type MobileAppLink,
    type MobileAppLinkStatus,
} from '@lightdash/common';
import { useDocumentVisibility } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const MOBILE_APP_LINK_POLL_INTERVAL_MS = 2000;
const MIN_MINT_INTERVAL_MS = 60_000;
export const MINT_RETRY_DELAYS_MS = [60_000, 120_000];
export const MAX_FAILED_MINTS = 3;

// Monotonic, so a wrong or changing wall clock cannot expire a code early.
const monotonicNow = () => performance.now();

type MintSchedule = { id: number; at: number };

export const useMobileAppLink = ({
    isPaused = false,
}: { isPaused?: boolean } = {}) => {
    const lightdashApi = useLightdashApi();
    const isVisible = useDocumentVisibility() === 'visible';

    const [link, setLink] = useState<MobileAppLink | null>(null);
    const [schedule, setSchedule] = useState<MintSchedule | null>({
        id: 0,
        at: 0,
    });
    const [hasFailed, setHasFailed] = useState(false);
    const nextScheduleId = useRef(1);
    const failedMints = useRef(0);

    const scheduleMint = useCallback((at: number) => {
        setSchedule({ id: nextScheduleId.current, at });
        nextScheduleId.current += 1;
    }, []);

    const recordFailedMint = useCallback(() => {
        failedMints.current += 1;
        if (failedMints.current >= MAX_FAILED_MINTS) {
            setSchedule(null);
            setHasFailed(true);
            return;
        }
        scheduleMint(
            monotonicNow() + MINT_RETRY_DELAYS_MS[failedMints.current - 1],
        );
    }, [scheduleMint]);

    const mint = useMutation<MobileAppLink, ApiError>(
        () =>
            lightdashApi<MobileAppLink>({
                url: '/user/mobile/app-links',
                method: 'POST',
                body: undefined,
            }),
        {
            onSuccess: (data) => {
                const lifetimeMs = data.expiresInSeconds * 1000;
                if (!(lifetimeMs > MIN_MINT_INTERVAL_MS)) {
                    recordFailedMint();
                    return;
                }
                failedMints.current = 0;
                setHasFailed(false);
                setLink(data);
                scheduleMint(monotonicNow() + lifetimeMs);
            },
            onError: recordFailedMint,
        },
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
            enabled: link !== null && isVisible && !hasFailed && !isPaused,
            refetchInterval: (data) =>
                data?.scannedAt ? false : MOBILE_APP_LINK_POLL_INTERVAL_MS,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            retry: false,
        },
    );
    const isScanned = (status.data?.scannedAt ?? null) !== null;

    const { mutate, isLoading: isMinting } = mint;
    const firedScheduleId = useRef<number | null>(null);
    useEffect(() => {
        if (!isVisible || isScanned || isMinting || schedule === null) {
            return undefined;
        }
        const fire = () => {
            if (firedScheduleId.current === schedule.id) return;
            firedScheduleId.current = schedule.id;
            mutate();
        };
        const delay = schedule.at - monotonicNow();
        if (delay <= 0) {
            fire();
            return undefined;
        }
        const timer = window.setTimeout(fire, delay);
        return () => window.clearTimeout(timer);
    }, [isVisible, isScanned, isMinting, schedule, mutate]);

    return {
        link,
        isScanned,
        hasFailed,
        retry: () => {
            failedMints.current = 0;
            setHasFailed(false);
            scheduleMint(0);
        },
    };
};
