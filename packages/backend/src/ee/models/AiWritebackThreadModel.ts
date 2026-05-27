import { Knex } from 'knex';
import {
    AiWritebackThreadTable,
    AiWritebackThreadTableName,
    DbAiWritebackThread,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

export class AiWritebackThreadModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async findByAiThreadUuid(
        aiThreadUuid: string,
    ): Promise<DbAiWritebackThread | null> {
        const row = await this.database<AiWritebackThreadTable>(
            AiWritebackThreadTableName,
        )
            .where('ai_thread_uuid', aiThreadUuid)
            .first();
        return row ?? null;
    }

    async create(data: {
        aiThreadUuid: string;
        sandboxId: string;
        prUrl: string;
    }): Promise<DbAiWritebackThread> {
        const [row] = await this.database<AiWritebackThreadTable>(
            AiWritebackThreadTableName,
        )
            .insert({
                ai_thread_uuid: data.aiThreadUuid,
                sandbox_id: data.sandboxId,
                pr_url: data.prUrl,
            })
            .returning('*');
        return row;
    }

    async deleteByAiThreadUuid(aiThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .delete();
    }
}
