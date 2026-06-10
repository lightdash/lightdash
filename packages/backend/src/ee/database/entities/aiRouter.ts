import { Knex } from 'knex';

export const AiRouterTableName = 'ai_router';

export type DbAiRouter = {
    ai_router_uuid: string;
    organization_uuid: string;
    enabled: boolean;
    project_uuids: string[];
    created_at: Date;
    updated_at: Date;
};

export type AiRouterTable = Knex.CompositeTableType<
    DbAiRouter,
    Pick<DbAiRouter, 'organization_uuid'> &
        Partial<Pick<DbAiRouter, 'enabled' | 'project_uuids'>>,
    Partial<Pick<DbAiRouter, 'enabled' | 'project_uuids'>> & {
        updated_at?: Knex.Raw;
    }
>;

export const AiRouterDecisionTableName = 'ai_router_decision';

export type AiRouterDecisionConfidence = 'high' | 'medium' | 'low';

export type AiRouterSelectionMode = 'auto_routed' | 'manual_pick';

export type DbAiRouterDecision = {
    ai_router_decision_uuid: string;
    ai_router_uuid: string;
    thread_uuid: string | null;
    user_uuid: string;
    prompt: string;
    suggested_agent_uuid: string;
    chosen_agent_uuid: string | null;
    confidence: AiRouterDecisionConfidence;
    reasoning: string;
    candidate_agent_uuids: string[];
    selection_mode: AiRouterSelectionMode | null;
    created_at: Date;
    committed_at: Date | null;
};

export type AiRouterDecisionTable = Knex.CompositeTableType<
    DbAiRouterDecision,
    Omit<
        DbAiRouterDecision,
        | 'ai_router_decision_uuid'
        | 'created_at'
        | 'committed_at'
        | 'chosen_agent_uuid'
        | 'selection_mode'
        | 'thread_uuid'
    >,
    Partial<
        Pick<
            DbAiRouterDecision,
            'thread_uuid' | 'chosen_agent_uuid' | 'selection_mode'
        >
    > & { committed_at?: Knex.Raw | Date | null }
>;

export const AiRouterInstructionVersionsTableName =
    'ai_router_instruction_versions';

export type DbAiRouterInstructionVersion = {
    ai_router_instruction_version_uuid: string;
    ai_router_uuid: string;
    project_uuid: string;
    instruction: string;
    tagged_agent_uuids: string[];
    created_at: Date;
};

export type AiRouterInstructionVersionsTable = Knex.CompositeTableType<
    DbAiRouterInstructionVersion,
    Omit<
        DbAiRouterInstructionVersion,
        'ai_router_instruction_version_uuid' | 'created_at'
    >
>;
