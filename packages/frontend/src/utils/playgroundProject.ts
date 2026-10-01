import { ProvisioningSource } from '@lightdash/common';

export const isPlaygroundProvisioningSource = (
    provisioningSource: ProvisioningSource | null | undefined,
): boolean => provisioningSource === ProvisioningSource.PLAYGROUND;
