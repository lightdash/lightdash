import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalKind,
    AiSetupScriptFormat,
    AiTransportKind,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { describeAgentMarker } from '../agentMarker';
import { type AiCredentialProvider } from './AiCredentialProvider';

export class UnavailableAiCredentialProvider<
    T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
> implements AiCredentialProvider<T> {
    constructor(
        readonly warehouseType: T['type'],
        private readonly reason: string,
    ) {}

    capabilities(): Omit<AiWarehouseCapabilities, 'marker'> {
        const unavailable = { available: false as const, reason: this.reason };
        const marked =
            describeAgentMarker(this.warehouseType).level !==
            AiAgentMarkerLevel.NONE;
        return {
            warehouseType: this.warehouseType,
            principals: {
                [AiPrincipalKind.PERSON]: marked
                    ? { available: true, method: AiCredentialMethod.MARKER }
                    : unavailable,
                [AiPrincipalKind.TWIN]: unavailable,
                [AiPrincipalKind.GROUP]: unavailable,
                [AiPrincipalKind.SHARED]: unavailable,
            },
            transports: {
                [AiTransportKind.DIRECT]: marked
                    ? { available: true }
                    : unavailable,
                [AiTransportKind.PROCEDURE]: unavailable,
            },
            setupFormat: AiSetupScriptFormat.SQL,
        };
    }

    async createSecret(): Promise<null> {
        return null;
    }

    async missingPrerequisite(): Promise<null> {
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
