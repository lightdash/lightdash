import {
    type AgentCapability,
    type AgentIdentityClaim,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AgentActionLogTableName = 'agent_action_log';

export type AgentActionPolicyLayer =
    | 'org_ceiling'
    | 'project_scope'
    | 'unmapped'
    | 'casl'
    | 'agent_scope'
    | 'organization_setting'
    | 'sql_approval'
    | 'writeback_policy'
    | 'warehouse_identity';

export type DbAgentActionLog = {
    agent_action_log_uuid: string;
    organization_uuid: string;
    project_uuid: string | null;
    occurred_at: Date;
    agent_identity: AgentIdentityClaim;
    object_type: string;
    object_uuid: string | null;
    object_id: string | null;
    version_uuid: string | null;
    action: string;
    outcome: 'allowed' | 'denied';
    policy_layer: AgentActionPolicyLayer | null;
    reason_code: string | null;
    capability: AgentCapability | null;
    policy_version: number | null;
};

export interface InsertAgentActionLog extends Omit<
    DbAgentActionLog,
    'agent_action_log_uuid' | 'occurred_at' | 'capability' | 'policy_version'
> {
    capability?: AgentCapability | null;
    policy_version?: number | null;
}

export type AgentActionLogTable = Knex.CompositeTableType<
    DbAgentActionLog,
    InsertAgentActionLog,
    never
>;
