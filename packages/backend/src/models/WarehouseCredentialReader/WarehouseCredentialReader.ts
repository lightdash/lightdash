import type { AiServiceAccountSlot } from '@lightdash/common';
import type { AiServiceAccountSecrets } from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';

export type AiServiceAccountSlotWithSecrets = {
    slot: AiServiceAccountSlot;
    secrets: AiServiceAccountSecrets;
};

export interface AiServiceAccountCredentialReader {
    readSlotWithSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSlotWithSecrets | null>;
    readReplaceableSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSecrets | null>;
}

export interface WarehouseCredentialReader {
    aiServiceAccount: AiServiceAccountCredentialReader;
}
