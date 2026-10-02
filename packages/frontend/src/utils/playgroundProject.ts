import { ProvisioningSource } from '@lightdash/common';

export const isPlaygroundProvisioningSource = (
    provisioningSource: string | null | undefined,
): boolean => provisioningSource === ProvisioningSource.PLAYGROUND;
