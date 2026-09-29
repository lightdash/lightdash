import { Knex } from 'knex';
import type {
    AiKeyManagement,
    AiUsageChannel,
    AiUsageOutcome,
} from '../../analytics/aiUsage';

export const AiUsageLedgerTableName = 'ai_usage_ledger';

export type DbAiUsageLedger = {
    ai_usage_ledger_uuid: string;
    event_id: string;
    organization_uuid: string;
    project_uuid: string | null;
    user_uuid: string | null;
    agent_uuid: string | null;
    thread_uuid: string | null;
    prompt_uuid: string | null;
    app_uuid: string | null;
    feature: string;
    function_id: string;
    model: string | null;
    provider: string | null;
    key_management: AiKeyManagement | null;
    usage_channel: AiUsageChannel | null;
    outcome: AiUsageOutcome;
    // bigint columns arrive as strings through the pg driver.
    input_tokens: string | null;
    output_tokens: string | null;
    cache_read_tokens: string | null;
    cache_write_tokens: string | null;
    reasoning_tokens: string | null;
    total_tokens: string | null;
    created_at: Date;
};

export type DbAiUsageLedgerInsert = Omit<
    DbAiUsageLedger,
    | 'ai_usage_ledger_uuid'
    | 'created_at'
    | 'input_tokens'
    | 'output_tokens'
    | 'cache_read_tokens'
    | 'cache_write_tokens'
    | 'reasoning_tokens'
    | 'total_tokens'
> & {
    input_tokens: number | null;
    output_tokens: number | null;
    cache_read_tokens: number | null;
    cache_write_tokens: number | null;
    reasoning_tokens: number | null;
    total_tokens: number | null;
};

export type AiUsageLedgerTable = Knex.CompositeTableType<
    DbAiUsageLedger,
    DbAiUsageLedgerInsert
>;
