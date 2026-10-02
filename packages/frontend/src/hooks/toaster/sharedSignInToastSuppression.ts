import type { ApiErrorDetail, SharedSignInStatus } from '@lightdash/common';
import { isSharedSignInModalError } from '../../components/ProjectConnection/SharedSignIn/sharedSignInCopy';

let modal: {
    projectUuid: string;
    status: SharedSignInStatus;
    viewerUserUuid: string | null;
} | null = null;
const listeners = new Set<() => void>();

export const shouldSuppressSharedSignInToast = (
    error: ApiErrorDetail,
): boolean =>
    modal !== null &&
    isSharedSignInModalError(error, modal.status, modal.viewerUserUuid);

export const subscribeToSharedSignInToastSuppression = (
    listener: () => void,
) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const setSharedSignInToastSuppression = (
    projectUuid: string,
    status: SharedSignInStatus,
    viewerUserUuid: string | null,
) => {
    modal = { projectUuid, status, viewerUserUuid };
    listeners.forEach((listener) => listener());
};

export const clearSharedSignInToastSuppression = (projectUuid: string) => {
    if (modal?.projectUuid === projectUuid) modal = null;
};
