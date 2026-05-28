import { Knex } from 'knex';
import {
    AiWritebackPromptTable,
    AiWritebackPromptTableName,
    DbAiWritebackPrompt,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

export class AiWritebackPromptModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async create(data: {
        projectUuid: string;
        organizationUuid: string;
        aiThreadUuid: string | null;
        createdByUserUuid: string | null;
        sandboxId: string;
        isResume: boolean;
        systemPrompt: string;
        prompt: string;
    }): Promise<DbAiWritebackPrompt> {
        const [row] = await this.database<AiWritebackPromptTable>(
            AiWritebackPromptTableName,
        )
            .insert({
                project_uuid: data.projectUuid,
                organization_uuid: data.organizationUuid,
                ai_thread_uuid: data.aiThreadUuid,
                created_by_user_uuid: data.createdByUserUuid,
                sandbox_id: data.sandboxId,
                is_resume: data.isResume,
                system_prompt: data.systemPrompt,
                prompt: data.prompt,
            })
            .returning('*');
        return row;
    }

    async respond(
        aiWritebackPromptUuid: string,
        data: { response: string; exitCode: number },
    ): Promise<void> {
        await this.database<AiWritebackPromptTable>(AiWritebackPromptTableName)
            .where('ai_writeback_prompt_uuid', aiWritebackPromptUuid)
            .update({
                response: data.response,
                exit_code: data.exitCode,
                responded_at: new Date(),
            });
    }
}
