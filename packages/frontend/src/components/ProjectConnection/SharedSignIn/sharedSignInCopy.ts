import {
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
): boolean => status?.expired === true && status.canReconnect;
