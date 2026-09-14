import type { Knex } from 'knex';
import { AiPromptTableName, type AiPromptTable } from '../database/entities/ai';

type Queryable = Knex | Knex.Transaction;

export const claimAiPromptExecutionMode = async (
    database: Queryable,
    promptUuid: string,
    executionMode: 'standard' | 'deep_research',
): Promise<boolean> => {
    const rows = await database<AiPromptTable>(AiPromptTableName)
        .update({ execution_mode: executionMode })
        .where('ai_prompt_uuid', promptUuid)
        .where((query) =>
            query
                .whereNull('execution_mode')
                .orWhere('execution_mode', executionMode),
        )
        .returning<{ ai_prompt_uuid: string }[]>('ai_prompt_uuid');

    return rows.length > 0;
};
