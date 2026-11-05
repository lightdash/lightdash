import { withCause } from '../../logging/withCause';

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
