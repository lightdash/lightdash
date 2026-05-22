import { Knex } from 'knex';

const AiAgentDocumentTableName = 'ai_agent_document';
const ConstraintName = 'ai_agent_document_content_size_check';
const OLD_MAX_CONTENT_BYTES = 20 * 1024;
const NEW_MAX_CONTENT_BYTES = 100 * 1024;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        AiAgentDocumentTableName,
        ConstraintName,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (content_size_bytes >= 0 AND content_size_bytes <= ${NEW_MAX_CONTENT_BYTES})`,
        [AiAgentDocumentTableName, ConstraintName],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        AiAgentDocumentTableName,
        ConstraintName,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (content_size_bytes >= 0 AND content_size_bytes <= ${OLD_MAX_CONTENT_BYTES})`,
        [AiAgentDocumentTableName, ConstraintName],
    );
}
