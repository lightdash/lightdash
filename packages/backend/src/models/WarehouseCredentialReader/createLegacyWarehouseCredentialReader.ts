import type { AiServiceAccountCredentialsModel } from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { LegacyAiServiceAccountCredentialReader } from './LegacyAiServiceAccountCredentialReader';
import type { WarehouseCredentialReader } from './WarehouseCredentialReader';

export const createLegacyWarehouseCredentialReader = (models: {
    aiServiceAccountCredentialsModel: Pick<
        AiServiceAccountCredentialsModel,
        'getSecrets' | 'getReplaceableSecrets'
    >;
}): WarehouseCredentialReader => ({
    aiServiceAccount: new LegacyAiServiceAccountCredentialReader({
        aiServiceAccountCredentialsModel:
            models.aiServiceAccountCredentialsModel,
    }),
});
