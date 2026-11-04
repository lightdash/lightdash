import type {
    AiServiceAccountCredentialsModel,
    AiServiceAccountSecrets,
} from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import type {
    AiServiceAccountCredentialReader,
    AiServiceAccountSlotWithSecrets,
} from './WarehouseCredentialReader';

export class LegacyAiServiceAccountCredentialReader implements AiServiceAccountCredentialReader {
    constructor(
        private readonly args: {
            aiServiceAccountCredentialsModel: Pick<
                AiServiceAccountCredentialsModel,
                'getSecrets' | 'getReplaceableSecrets'
            >;
        },
    ) {}

    readSlotWithSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSlotWithSecrets | null> {
        return this.args.aiServiceAccountCredentialsModel.getSecrets(
            projectUuid,
            warehouseConnectionUuid,
            true,
        );
    }

    readReplaceableSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiServiceAccountSecrets | null> {
        return this.args.aiServiceAccountCredentialsModel.getReplaceableSecrets(
            projectUuid,
            warehouseConnectionUuid,
        );
    }
}
