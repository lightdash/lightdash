import {
    type AiAccessRefusalReason,
    type AiAssurance,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { withCause } from '../../../logging/withCause';
import { type AiAccessEvaluation } from '../AiAccessService';

export type AiMintArgs<T extends CreateWarehouseCredentials> = {
    silentRefresh: boolean;
    connection: T;
    person: { organizationUuid: string; userUuid: string; email: string };
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

export class AgentSessionCheckError extends Error {
    constructor(
        readonly reason: AiSessionFailureReason,
        message: string,
        cause: unknown,
    ) {
        super(message);
        withCause(this, cause);
    }
}

export type AiSessionProbeResult =
    | { ok: true; checkedAt: Date; observed: Record<string, string | null> }
    | {
          ok: false;
          transient: boolean;
          cause: unknown;
          checkedAt: Date;
          reason: AiSessionFailureReason;
          message: string;
          observed: Record<string, string | null>;
      };

export interface AiCredentialProvider<
    T extends CreateWarehouseCredentials = CreateWarehouseCredentials,
> {
    readonly warehouseType: T['type'];
    configurationError(organizationUuid: string): Promise<string | null>;
    missingPrerequisite(
        args: AiMintArgs<T>,
    ): Promise<AiAccessRefusalReason | null>;
    mint(
        args: AiMintArgs<T> & {
            organizationUuid: string;
            evaluationKind: AiAccessEvaluation['kind'];
        },
    ): Promise<AiMintedCredentials<T>>;
    probe(
        credentials: T,
        assurances: AiAssurance[],
    ): Promise<AiSessionProbeResult>;
}
