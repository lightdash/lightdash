import type { CompactedStreamColumn } from './types';

export const agentEvaluationRunColumns: CompactedStreamColumn[] = [
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'agent_id', type: 'VARCHAR' },
    { name: 'agent_name', type: 'VARCHAR' },
    { name: 'evaluation_id', type: 'VARCHAR' },
    { name: 'evaluation_name', type: 'VARCHAR' },
    { name: 'run_id', type: 'VARCHAR' },
    { name: 'run_status', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'passed_count', type: 'BIGINT' },
    { name: 'failed_count', type: 'BIGINT' },
    { name: 'unassessed_count', type: 'BIGINT' },
    { name: 'execution_error_count', type: 'BIGINT' },
];
