import { type ServiceAccount } from '@lightdash/common';

export const STALE_THRESHOLD_DAYS = 30;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export const isServiceAccountStale = (
    serviceAccount: ServiceAccount,
): boolean => {
    const reference = serviceAccount.lastUsedAt ?? serviceAccount.createdAt;
    return Date.now() - new Date(reference).getTime() > STALE_THRESHOLD_MS;
};
