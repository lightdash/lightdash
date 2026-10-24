// Reads one stored warehouse credential from its store and names the row it came from.
// WarehouseCredentialSource (services/WarehouseClientFactory) sits above it: it picks the route and the credential for one request.
import type { AiServiceAccountSlot } from '@lightdash/common';
import type { AiServiceAccountSecrets } from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';

export type WarehouseCredentialStore =
    | 'project'
    | 'warehouseConnection'
    | 'organization'
    | 'user'
    | 'aiServiceAccount';

export type WarehouseCredentialOwner = {
    credentialUuid: string | null;
    generation: string | null;
};

export type WarehouseCredentialRead<T> = {
    value: T;
    store: WarehouseCredentialStore;
    owner: WarehouseCredentialOwner;
};

export type AiServiceAccountSlotWithSecrets = {
    slot: AiServiceAccountSlot;
    secrets: AiServiceAccountSecrets;
};

export interface AiServiceAccountCredentialReader {
    readSlotWithSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<WarehouseCredentialRead<AiServiceAccountSlotWithSecrets | null>>;
    readReplaceableSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<WarehouseCredentialRead<AiServiceAccountSecrets | null>>;
}

export interface WarehouseCredentialReader {
    aiServiceAccount: AiServiceAccountCredentialReader;
}
