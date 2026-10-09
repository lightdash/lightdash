import { type AiServiceAccountCredentialInput } from './agentIdentity';
import { type WarehouseTypes } from './projects';

export type AgentAccessTestEntryPoint = 'project_agent_identity_page';

export interface AgentAccessTestRequest {
    credentials: AiServiceAccountCredentialInput | null;
    entryPoint: AgentAccessTestEntryPoint;
}

export type AgentTableStatus =
    | { kind: 'readable'; reason: null }
    | { kind: 'blocked'; reason: 'access_denied' }
    | {
          kind: 'error';
          reason:
              | 'not_found'
              | 'quota'
              | 'timeout'
              | 'unavailable'
              | 'unsupported'
              | 'unknown';
      }
    | { kind: 'not_checked'; reason: 'timeout' };

export interface AgentAccessDataset {
    database: string;
    schema: string;
}

export interface AgentAccessTable extends AgentAccessDataset {
    name: string;
    status: AgentTableStatus;
}

export interface AgentAccessReport {
    warehouseType: WarehouseTypes;
    subject: { kind: 'ai_service_account' };
    principal: string | null;
    credentialSource: 'saved' | 'submitted';
    status: 'complete' | 'partial' | 'failed';
    failureReason:
        | 'invalid_credentials'
        | 'job_permission_denied'
        | 'warehouse_denied'
        | 'baseline_failed'
        | 'timeout'
        | 'quota'
        | 'unavailable'
        | 'unknown'
        | null;
    message: string | null;
    datasets: AgentAccessDataset[];
    tables: AgentAccessTable[];
    readableCount: number;
    blockedCount: number;
    errorCount: number;
    checkedCount: number;
    notCheckedCount: number;
    totalCount: number | null;
    truncatedCount: number;
    checkedAt: Date;
}

export interface ApiAgentAccessReportResponse {
    status: 'ok';
    results: AgentAccessReport;
}
