import {
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    type ApiError,
    type MobileSignInCode,
    type MobileSignInCodeState,
    type MobileSignInDecision,
    type MobileSignInMintReason,
} from '@lightdash/common';
import { useDocumentVisibility } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { useNow } from './useNow';

export const MOBILE_SIGN_IN_POLL_INTERVAL_MS = 2000;
export const MOBILE_SIGN_IN_IDLE_LIMIT_MS = 15 * 60 * 1000;
const MOBILE_SIGN_IN_MIN_REFRESH_MS = 60 * 1000;

export type MobileSignInPhase =
    | 'hidden'
    | 'refused'
    | 'failed'
    | 'showing'
    | 'claimed'
    | 'approved'
    | 'expired'
    | 'declined'
    | 'redeemed';

const TERMINAL_STATUSES: MobileSignInCodeStatus[] = [
    MobileSignInCodeStatus.DECLINED,
    MobileSignInCodeStatus.REDEEMED,
];

const getRefusal = (error: ApiError | null): MobileSignInRefusal | null => {
    const reason = error?.error.data?.reason;
    return Object.values(MobileSignInRefusal).includes(reason)
        ? (reason as MobileSignInRefusal)
        : null;
};

const getPhase = ({
    isShown,
    code,
    status,
    isPastExpiry,
    isUnclaimed,
    refusal,
    mintError,
}: {
    isShown: boolean;
    code: MobileSignInCode | null;
    status: MobileSignInCodeStatus | undefined;
    isPastExpiry: boolean;
    isUnclaimed: boolean;
    refusal: MobileSignInRefusal | null;
    mintError: ApiError | null;
}): MobileSignInPhase => {
    if (refusal) return 'refused';
    if (mintError) return 'failed';
    if (!isShown || !code) return 'hidden';
    switch (status) {
        case MobileSignInCodeStatus.CLAIMED:
            return isPastExpiry ? 'expired' : 'claimed';
        case MobileSignInCodeStatus.APPROVED:
            return isPastExpiry ? 'expired' : 'approved';
        case MobileSignInCodeStatus.DECLINED:
            return 'declined';
        case MobileSignInCodeStatus.REDEEMED:
            return 'redeemed';
        case MobileSignInCodeStatus.EXPIRED:
            return isUnclaimed ? 'showing' : 'expired';
        default:
            return 'showing';
    }
};

const getCodeTiming = ({
    now,
    code,
    mintedAt,
    state,
}: {
    now: number;
    code: MobileSignInCode | null;
    mintedAt: number | null;
    state: MobileSignInCodeState | null;
}) => {
    const isUnclaimed = state === null || state.device === null;
    const lifetimeMs = code
        ? Math.max(code.expiresInSeconds * 1000, MOBILE_SIGN_IN_MIN_REFRESH_MS)
        : null;
    return {
        isUnclaimed,
        isPastExpiry:
            isUnclaimed &&
            lifetimeMs !== null &&
            mintedAt !== null &&
            now - mintedAt >= lifetimeMs,
    };
};

const statusQueryKey = (codeUuid: string | undefined) => [
    'mobile-sign-in-code',
    codeUuid,
];

const useMobileSignInRequests = ({
    code,
    onMinted,
    isWanted,
    isPolling,
}: {
    code: MobileSignInCode | null;
    onMinted: (code: MobileSignInCode) => void;
    isWanted: () => boolean;
    isPolling: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const cancel = useMutation<undefined, ApiError, string>((codeUuid) =>
        lightdashApi<undefined>({
            url: `/user/mobile/sign-in-codes/${codeUuid}`,
            method: 'DELETE',
            body: undefined,
        }),
    );

    const mint = useMutation<
        MobileSignInCode,
        ApiError,
        MobileSignInMintReason
    >(
        (reason) =>
            lightdashApi<MobileSignInCode>({
                url: '/user/mobile/sign-in-codes',
                method: 'POST',
                body: JSON.stringify({ reason }),
            }),
        {
            onSuccess: (minted) => {
                if (isWanted()) onMinted(minted);
                else cancel.mutate(minted.codeUuid);
            },
        },
    );

    const status = useQuery<MobileSignInCodeState, ApiError>(
        statusQueryKey(code?.codeUuid),
        () =>
            lightdashApi<MobileSignInCodeState>({
                url: `/user/mobile/sign-in-codes/${code?.codeUuid}`,
                method: 'GET',
                body: undefined,
            }),
        {
            enabled: isPolling,
            refetchInterval: (data) =>
                data && TERMINAL_STATUSES.includes(data.status)
                    ? false
                    : MOBILE_SIGN_IN_POLL_INTERVAL_MS,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            retry: false,
        },
    );
    const state =
        status.data && status.data.codeUuid === code?.codeUuid
            ? status.data
            : null;

    const decide = useMutation<
        MobileSignInDecision,
        ApiError,
        'approve' | 'decline'
    >(
        (decision) =>
            lightdashApi<MobileSignInDecision>({
                url: `/user/mobile/sign-in-codes/${code?.codeUuid}/${decision}`,
                method: 'POST',
                body: JSON.stringify({ nonce: code?.approvalNonce }),
            }),
        { onSettled: () => status.refetch() },
    );

    return { mint, cancel, state, decide };
};

const useShownClock = ({
    isShown,
    isVisible,
    code,
    shownAt,
}: {
    isShown: boolean;
    isVisible: boolean;
    code: MobileSignInCode | null;
    shownAt: number | null;
}) => {
    const queryClient = useQueryClient();
    const cachedState = queryClient.getQueryData<MobileSignInCodeState>(
        statusQueryKey(code?.codeUuid),
    );
    const isTerminal =
        cachedState !== undefined &&
        TERMINAL_STATUSES.includes(cachedState.status);
    const now = useNow(isShown && code !== null && isVisible && !isTerminal);
    return {
        now,
        isStopped:
            isShown &&
            shownAt !== null &&
            now - shownAt >= MOBILE_SIGN_IN_IDLE_LIMIT_MS &&
            !cachedState?.device,
    };
};

const useCodeLifecycle = ({
    code,
    phase,
    isRefreshDue,
    isStopped,
    refresh,
    cancelCode,
}: {
    code: MobileSignInCode | null;
    phase: MobileSignInPhase;
    isRefreshDue: boolean;
    isStopped: boolean;
    refresh: () => void;
    cancelCode: (codeUuid: string) => void;
}) => {
    const stoppedCodeUuid = isStopped && code ? code.codeUuid : null;
    const pendingCodeUuid =
        code && phase !== 'redeemed' && phase !== 'declined'
            ? code.codeUuid
            : null;
    const refreshedFor = useRef<string | null>(null);
    const refreshRef = useRef(refresh);
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);
    useEffect(() => {
        if (!isRefreshDue || !code || refreshedFor.current === code.codeUuid)
            return;
        refreshedFor.current = code.codeUuid;
        refreshRef.current();
    }, [isRefreshDue, code]);

    useEffect(() => {
        if (stoppedCodeUuid) cancelCode(stoppedCodeUuid);
    }, [stoppedCodeUuid, cancelCode]);

    const pendingCode = useRef<string | null>(null);
    useEffect(() => {
        pendingCode.current = pendingCodeUuid;
    }, [pendingCodeUuid]);
    useEffect(
        () => () => {
            if (pendingCode.current) cancelCode(pendingCode.current);
        },
        [cancelCode],
    );
};

const useAutoShow = ({
    autoShow,
    isVisible,
    show,
}: {
    autoShow: boolean;
    isVisible: boolean;
    show: () => void;
}) => {
    const hasAutoShown = useRef(false);
    useEffect(() => {
        if (!autoShow) {
            hasAutoShown.current = false;
            return;
        }
        const isDocumentVisible =
            isVisible && document.visibilityState === 'visible';
        if (!isDocumentVisible || hasAutoShown.current) return;
        hasAutoShown.current = true;
        show();
    }, [autoShow, isVisible, show]);
};

export const useMobileSignInCode = ({
    autoShow = false,
}: { autoShow?: boolean } = {}) => {
    const isVisible = useDocumentVisibility() === 'visible';
    const [isShown, setIsShown] = useState(false);
    const isShownRef = useRef(false);
    const [shownAt, setShownAt] = useState<number | null>(null);
    const [code, setCode] = useState<MobileSignInCode | null>(null);
    const [mintedAt, setMintedAt] = useState<number | null>(null);
    const { now, isStopped } = useShownClock({
        isShown,
        isVisible,
        code,
        shownAt,
    });

    const { mint, cancel, state, decide } = useMobileSignInRequests({
        code,
        onMinted: (minted) => {
            setCode(minted);
            setMintedAt(performance.now());
        },
        isWanted: () => isShownRef.current,
        isPolling: isShown && !isStopped && code !== null && isVisible,
    });

    const { isUnclaimed, isPastExpiry } = getCodeTiming({
        now,
        code,
        mintedAt,
        state,
    });

    const mintError = mint.error ?? null;
    const refusal = getRefusal(mintError);
    const phase = getPhase({
        isShown: isShown && !isStopped,
        code,
        status: state?.status,
        isPastExpiry,
        isUnclaimed,
        refusal,
        mintError,
    });

    const { mutate: mintCode, reset: resetMint, isLoading: isMinting } = mint;
    const { mutate: cancelCode } = cancel;

    const hide = useCallback(() => {
        if (code && phase !== 'redeemed') cancelCode(code.codeUuid);
        isShownRef.current = false;
        setIsShown(false);
        setShownAt(null);
        setCode(null);
        resetMint();
    }, [code, phase, cancelCode, resetMint]);

    const show = useCallback(() => {
        resetMint();
        isShownRef.current = true;
        setIsShown(true);
        setShownAt(performance.now());
        setCode(null);
        mintCode('show');
    }, [mintCode, resetMint]);

    useAutoShow({ autoShow, isVisible, show });

    useCodeLifecycle({
        code,
        phase,
        isRefreshDue: [
            isShown,
            isVisible,
            !isMinting,
            isUnclaimed,
            isPastExpiry,
            !isStopped,
        ].every(Boolean),
        isStopped,
        refresh: () => mintCode('auto_refresh'),
        cancelCode,
    });

    return {
        phase,
        code,
        state,
        refusal,
        mintError,
        isRefreshed: mint.variables === 'auto_refresh' && phase === 'showing',
        isMinting,
        isDeciding: decide.isLoading,
        show,
        hide,
        approve: () => decide.mutate('approve'),
        decline: () => decide.mutate('decline'),
    };
};
