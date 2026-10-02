import {
    getExpiredSharedSignInMessage,
    type ApiErrorDetail,
    type SharedSignInExpiry,
    type SharedSignInStatus,
} from '@lightdash/common';

export const getSharedSignInExpiry = (
    apiError: Pick<ApiErrorDetail, 'data'>,
): SharedSignInExpiry | null => {
    const sharedSignIn: unknown = apiError.data?.sharedSignIn;
    return sharedSignIn && typeof sharedSignIn === 'object'
        ? (sharedSignIn as SharedSignInExpiry)
        : null;
};

export const shouldOpenSharedSignInReconnectModal = (
    status: SharedSignInStatus | null,
): status is SharedSignInStatus =>
    status?.expired === true && status.canReconnect;

export const isSharedSignInModalError = (
    error: Pick<ApiErrorDetail, 'data' | 'message'>,
    status: SharedSignInStatus,
    viewerUserUuid: string | null,
): boolean => {
    const expiry = getSharedSignInExpiry(error);
    return (
        (expiry?.provider === status.provider &&
            expiry.subjectUserUuid === (status.subject?.userUuid ?? null) &&
            expiry.subjectBasis === status.subjectBasis) ||
        error.message ===
            getExpiredSharedSignInMessage(
                {
                    provider: status.provider,
                    subjectUserUuid: status.subject?.userUuid ?? null,
                    subjectName: status.subject?.name ?? null,
                    subjectBasis: status.subjectBasis,
                },
                viewerUserUuid,
            )
    );
};
