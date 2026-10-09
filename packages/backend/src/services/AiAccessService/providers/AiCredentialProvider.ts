import {
    type AiAccessRefusalReason,
    type AiAssurance,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export type AiMintArgs<T extends CreateWarehouseCredentials> = {
    silentRefresh: boolean;
    connection: T;
    person: { userUuid: string; email: string };
};

export type AiMintedCredentials<T extends CreateWarehouseCredentials> = {
    identityUuid: string;
    credentials: T;
    assurances: AiAssurance[];
    expiresAt: Date | null;
};

export enum AiSessionFailureReason {
    CREDENTIAL_REJECTED = 'credential_rejected',
    NOT_AGENT_SESSION = 'not_agent_session',
    WAREHOUSE_ACCESS = 'warehouse_access',
    DISABLED_OR_LOCKED = 'disabled_or_locked',
    NETWORK_POLICY = 'network_policy',
    UNKNOWN = 'unknown',
}

export type AiSessionProbeResult =
    | { ok: true; checkedAt: Date; observed: Record<string, string | null> }
    | {
          ok: false;
          transient: boolean;
          checkedAt: Date;
          reason: AiSessionFailureReason;
          message: string;
          observed: Record<string, string | null>;
      };

export interface AiCredentialProvider<
    T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
> {
    readonly warehouseType: T['type'];
    configurationError(): string | null;
    missingPrerequisite(
        args: AiMintArgs<T>,
    ): Promise<AiAccessRefusalReason | null>;
    mint(args: AiMintArgs<T>): Promise<AiMintedCredentials<T>>;
    probe(
        credentials: T,
        assurances: AiAssurance[],
    ): Promise<AiSessionProbeResult>;
}
