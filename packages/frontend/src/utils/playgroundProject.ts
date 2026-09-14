const PLAYGROUND_PROVISIONING_SOURCE = 'playground';

export const isPlaygroundProvisioningSource = (
    provisioningSource: string | null | undefined,
): boolean => provisioningSource === PLAYGROUND_PROVISIONING_SOURCE;
