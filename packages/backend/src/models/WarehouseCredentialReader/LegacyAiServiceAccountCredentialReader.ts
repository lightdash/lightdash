import type {
    AiServiceAccountCredentialsModel,
    AiServiceAccountSecrets,
} from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import type {
    AiServiceAccountCredentialReader,
    AiServiceAccountSlotWithSecrets,
    WarehouseCredentialRead,
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

    async readSlotWithSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<
        WarehouseCredentialRead<AiServiceAccountSlotWithSecrets | null>
    > {
        const value =
            await this.args.aiServiceAccountCredentialsModel.getSecrets(
                projectUuid,
                warehouseConnectionUuid,
                true,
            );
        return {
            value,
            store: 'aiServiceAccount',
            owner:
                value === null
                    ? { credentialUuid: null, generation: null }
                    : {
                          credentialUuid: value.slot.uuid,
                          generation: value.slot.identityUuid,
                      },
        };
    }

    async readReplaceableSecrets(
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<WarehouseCredentialRead<AiServiceAccountSecrets | null>> {
        const value =
            await this.args.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            );
        return {
            value,
            store: 'aiServiceAccount',
            owner: { credentialUuid: null, generation: null },
        };
    }
}
