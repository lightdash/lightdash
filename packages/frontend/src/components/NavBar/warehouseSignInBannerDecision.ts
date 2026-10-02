import type { WarehouseSignInStatus } from '@lightdash/common';

export const shouldShowWarehouseSignInBanner = (
    status: WarehouseSignInStatus | undefined,
): boolean => status?.signIn?.expired === true;

export const getWarehouseSignInBanner = (
    projectUuid: string | undefined,
    status: WarehouseSignInStatus | undefined,
): { projectUuid: string; status: WarehouseSignInStatus } | null =>
    projectUuid && status && shouldShowWarehouseSignInBanner(status)
        ? { projectUuid, status }
        : null;
