import {
    getExpiredSharedSignInMessage,
    getExpiredPersonalSignInMessage,
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
    !!status &&
    (status.personalSignIn
        ? status.personalSignIn.expired && status.personalSignIn.canReconnect
        : status.expired && status.canReconnect);

export const isSharedSignInModalError = (
    error: Pick<ApiErrorDetail, 'data' | 'message'>,
    status: SharedSignInStatus,
    viewerUserUuid: string | null,
): boolean => {
    if (status.personalSignIn) {
        const personal = error.data?.personalSignIn;
        return personal && typeof personal === 'object'
            ? 'provider' in personal &&
                  personal.provider === status.personalSignIn.provider &&
                  'userWarehouseCredentialsUuid' in personal &&
                  personal.userWarehouseCredentialsUuid ===
                      status.personalSignIn.userWarehouseCredentialsUuid &&
                  'projectUuid' in personal &&
                  personal.projectUuid === status.personalSignIn.projectUuid
            : error.message ===
                  getExpiredPersonalSignInMessage(status.personalSignIn);
    }
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
