import { withCause } from '../../../logging/withCause';
import type { AiSessionProbeResult } from '../../AiAccessService/agentSession';

export type AgentCredentialFailure =
    | {
          kind: 'credential';
          classification:
              | 'missing'
              | 'unusable'
              | 'source_changed'
              | 'binding_mismatch'
              | 'expired';
      }
    | { kind: 'client'; classification: 'missing' }
    | {
          kind: 'refresh';
          classification:
              | 'grant_gone'
              | 'temporary'
              | 'configuration'
              | 'legacy_grant_gone'
              | 'legacy_failure';
      }
    | {
          kind: 'session';
          session: Extract<AiSessionProbeResult, { ok: false }>;
      };

export class AgentCredentialResolutionError extends Error {
    constructor(
        readonly failure: AgentCredentialFailure,
        readonly originalCause: unknown = null,
    ) {
        super('Agent credential resolution failed');
        withCause(this, originalCause);
    }
}
