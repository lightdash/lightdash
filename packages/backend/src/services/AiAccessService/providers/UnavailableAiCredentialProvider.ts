import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiPrincipalKind,
    AiSetupScriptFormat,
    AiTransportKind,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type AiCredentialProvider } from './AiCredentialProvider';

export class UnavailableAiCredentialProvider<
    T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
> implements AiCredentialProvider<T> {
    constructor(
        readonly warehouseType: T['type'],
        private readonly reason: string,
    ) {}

    capabilities(): AiWarehouseCapabilities {
        const unavailable = { available: false as const, reason: this.reason };
        return {
            warehouseType: this.warehouseType,
            principals: {
                [AiPrincipalKind.PERSON]: unavailable,
                [AiPrincipalKind.TWIN]: unavailable,
                [AiPrincipalKind.GROUP]: unavailable,
                [AiPrincipalKind.SHARED]: unavailable,
            },
            transports: {
                [AiTransportKind.DIRECT]: unavailable,
                [AiTransportKind.PROCEDURE]: unavailable,
            },
            setupFormat: AiSetupScriptFormat.SQL,
        };
    }

    async createSecret(): Promise<null> {
        return null;
    }

    async mint(): Promise<never> {
        throw new AiAccessRefusedError(
            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            { message: this.reason },
        );
    }

    async probe(): Promise<never> {
        throw new AiAccessRefusedError(
            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            { message: this.reason },
        );
    }

    setupScript(): never {
        throw new AiAccessRefusedError(
            AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
            { message: this.reason },
        );
    }
}
