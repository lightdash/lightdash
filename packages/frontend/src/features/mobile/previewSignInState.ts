import {
    LightdashMode,
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    type MobileSignInCodeState,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import useHealth from '../../hooks/health/useHealth';
import {
    type MobileSignInPhase,
    type useMobileSignInCode,
} from './useMobileSignInCode';

type SignIn = ReturnType<typeof useMobileSignInCode>;

const PREVIEW_SIGN_IN_PARAM = 'mobileSignInState';

export const PREVIEW_SIGN_IN_PHASES = [
    'showing',
    'claimed',
    'approved',
    'redeemed',
    'expired',
    'declined',
    'refused',
    'failed',
] as const satisfies readonly MobileSignInPhase[];

export type PreviewSignInPhase = (typeof PREVIEW_SIGN_IN_PHASES)[number];

export const previewSignInLabel = (phase: MobileSignInPhase) =>
    `Preview state: ${phase}`;

export const PREVIEW_SIGN_IN_STRINGS = {
    simulateScan: 'Preview: simulate scan',
    pattern: 'Preview only, not a code',
} as const;

export const parsePreviewSignInPhase = (
    search: string,
): PreviewSignInPhase | null => {
    const value = new URLSearchParams(search).get(PREVIEW_SIGN_IN_PARAM);
    return PREVIEW_SIGN_IN_PHASES.find((phase) => phase === value) ?? null;
};

export const isPreviewBuild = (
    mode: LightdashMode | undefined,
    isDevBuild: boolean,
) => isDevBuild || mode === LightdashMode.PR;

const STATUS: Partial<Record<PreviewSignInPhase, MobileSignInCodeStatus>> = {
    claimed: MobileSignInCodeStatus.CLAIMED,
    approved: MobileSignInCodeStatus.APPROVED,
    redeemed: MobileSignInCodeStatus.REDEEMED,
    expired: MobileSignInCodeStatus.EXPIRED,
    declined: MobileSignInCodeStatus.DECLINED,
};

const previewState = (
    phase: PreviewSignInPhase,
): MobileSignInCodeState | null => {
    const status = STATUS[phase];
    if (!status) return null;
    return {
        codeUuid: 'preview',
        status,
        expiresAt: new Date(0).toISOString(),
        matchNumber: phase === 'approved' ? '47' : null,
        declinedBy: phase === 'declined' ? 'web' : null,
        device: { platform: 'ios', clientName: 'Lightdash iOS' },
    };
};

export const usePreviewSignInPhase = () => {
    const { search } = useLocation();
    const { data: health } = useHealth();
    const requested = parsePreviewSignInPhase(search);
    const isAllowed = health
        ? isPreviewBuild(health.mode, import.meta.env.DEV)
        : null;
    return {
        forced: requested && isAllowed ? requested : null,
        holdsMint: requested !== null && isAllowed !== false,
    };
};

export const usePreviewSignIn = (
    forced: PreviewSignInPhase | null,
): SignIn | null => {
    const [moved, setMoved] = useState<{
        from: PreviewSignInPhase;
        to: PreviewSignInPhase;
    } | null>(null);
    const phase = moved && moved.from === forced ? moved.to : forced;

    return useMemo(() => {
        if (!forced || !phase) return null;
        const moveTo = (to: PreviewSignInPhase) => () =>
            setMoved({ from: forced, to });
        return {
            phase,
            code: null,
            state: previewState(phase),
            refusal:
                phase === 'refused' ? MobileSignInRefusal.RATE_LIMITED : null,
            mintError: null,
            isRefreshed: false,
            isMinting: false,
            isDeciding: false,
            show: moveTo('claimed'),
            hide: () => undefined,
            approve: moveTo('approved'),
            decline: moveTo('declined'),
        };
    }, [forced, phase]);
};
