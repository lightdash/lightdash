import { MobileSetupCodeStatus } from '@lightdash/common';
import { useDocumentVisibility } from '@mantine/hooks';
import { useCallback, useEffect, useRef } from 'react';
import {
    useMintMobileSetupCode,
    useMobileSetupCodeStatus,
    useRevokeMobileSetupCode,
} from './useMobileSetupCodes';

const ROTATE_BEFORE_EXPIRY_MS = 30_000;

// A revoked code means another tab (or another device) minted one, so rotating
// here would take it straight back and the two tabs would trade it forever.
const ROTATABLE_STATUSES = [
    MobileSetupCodeStatus.PENDING,
    MobileSetupCodeStatus.EXPIRED,
];

type Args = {
    projectUuid: string | undefined;
    enabled: boolean;
};

export const useMobileSetupSession = ({ projectUuid, enabled }: Args) => {
    const isVisible = useDocumentVisibility() === 'visible';

    const {
        mutate: mintCode,
        data: code,
        isLoading: isMinting,
        error: mintError,
    } = useMintMobileSetupCode();
    const { mutate: revokeCode } = useRevokeMobileSetupCode();

    const codeId = code?.codeId;
    const expiresAt = code?.expiresAt;

    const { data: codeState } = useMobileSetupCodeStatus(codeId, {
        poll: isVisible,
    });

    const status = codeState?.status ?? MobileSetupCodeStatus.PENDING;

    const mintedForProject = useRef<string | undefined>(undefined);
    const latestCodeId = useRef<string | undefined>(undefined);

    useEffect(() => {
        latestCodeId.current = codeId;
    }, [codeId]);

    useEffect(() => {
        if (!enabled || !projectUuid) return;
        if (mintedForProject.current === projectUuid) return;
        mintedForProject.current = projectUuid;
        mintCode(projectUuid);
    }, [enabled, projectUuid, mintCode]);

    useEffect(
        () => () => {
            if (latestCodeId.current) revokeCode(latestCodeId.current);
            mintedForProject.current = undefined;
        },
        [revokeCode],
    );

    useEffect(() => {
        if (!enabled || !projectUuid || !expiresAt) return;
        if (!isVisible) return;
        if (!ROTATABLE_STATUSES.includes(status)) return;

        const msUntilRotation =
            new Date(expiresAt).getTime() -
            ROTATE_BEFORE_EXPIRY_MS -
            Date.now();
        const timer = setTimeout(
            () => mintCode(projectUuid),
            Math.max(msUntilRotation, 0),
        );

        return () => clearTimeout(timer);
    }, [enabled, projectUuid, expiresAt, isVisible, status, mintCode]);

    const setupAnotherDevice = useCallback(() => {
        if (projectUuid) mintCode(projectUuid);
    }, [mintCode, projectUuid]);

    return {
        link: code?.link,
        status,
        redeemedPlatform: codeState?.redeemedPlatform ?? null,
        isLoading: isMinting && !code,
        error: mintError,
        setupAnotherDevice,
    };
};
