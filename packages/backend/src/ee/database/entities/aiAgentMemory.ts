import type { AiProjectContextTypedObjectRef } from '@lightdash/common';
import { Knex } from 'knex';

export const AiAgentMemoryTableName = 'ai_agent_memory';
export const AiAgentThreadDistillTableName = 'ai_agent_thread_distill';

export type AiAgentMemoryStatus = 'active' | 'superseded' | 'retired';
export type AiAgentThreadDistillOutcome =
    | 'memory'
    | 'no_op'
    | 'skipped'
    | 'failed';

export type DbAiAgentMemory = {
    ai_agent_memory_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    agent_uuid: string | null;
    user_uuid: string | null;
    source_thread_uuid: string | null;
    slug: string;
    title: string;
    raw_memory: string;
    thread_summary: string | null;
    terms: string[];
    objects: AiProjectContextTypedObjectRef[];
    unresolved_objects: AiProjectContextTypedObjectRef[];
    status: AiAgentMemoryStatus;
    superseded_by_uuid: string | null;
    generated_at: Date;
    cited_count: number;
    last_cited_at: Date | null;
    pulled_count: number;
    last_pulled_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

type AiAgentMemoryJsonbWrite = {
    terms: string;
    objects: string;
    unresolved_objects: string;
};

export type AiAgentMemoryTable = Knex.CompositeTableType<
    DbAiAgentMemory,
    Omit<
        DbAiAgentMemory,
        | keyof AiAgentMemoryJsonbWrite
        | 'ai_agent_memory_uuid'
        | 'status'
        | 'superseded_by_uuid'
        | 'cited_count'
        | 'last_cited_at'
        | 'pulled_count'
        | 'last_pulled_at'
        | 'created_at'
        | 'updated_at'
    > &
        Partial<
            Pick<
                DbAiAgentMemory,
                | 'status'
                | 'superseded_by_uuid'
                | 'cited_count'
                | 'last_cited_at'
                | 'pulled_count'
                | 'last_pulled_at'
            >
        >,
    Partial<
        Omit<
            DbAiAgentMemory,
            | keyof AiAgentMemoryJsonbWrite
            | 'ai_agent_memory_uuid'
            | 'created_at'
            | 'updated_at'
        > &
            AiAgentMemoryJsonbWrite
    > & { updated_at?: Knex.Raw }
>;

export type DbAiAgentThreadDistill = {
    ai_agent_thread_distill_uuid: string;
    ai_thread_uuid: string;
    outcome: AiAgentThreadDistillOutcome;
    no_op_reason: string | null;
    error_message: string | null;
    distill_prompt_hash: string | null;
    distilled_up_to: Date;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentThreadDistillTable = Knex.CompositeTableType<
    DbAiAgentThreadDistill,
    Omit<
        DbAiAgentThreadDistill,
        'ai_agent_thread_distill_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Omit<
            DbAiAgentThreadDistill,
            'ai_agent_thread_distill_uuid' | 'ai_thread_uuid' | 'created_at'
        >
    > & { updated_at: Knex.Raw }
>;
