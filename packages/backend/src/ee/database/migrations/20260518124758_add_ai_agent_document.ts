import { Knex } from 'knex';

const AiAgentDocumentTableName = 'ai_agent_document';
const AiAgentDocumentAccessTableName = 'ai_agent_document_access';
const AiAgentTableName = 'ai_agent';
const OrganizationsTableName = 'organizations';
const UsersTableName = 'users';

const MAX_CONTENT_BYTES = 20 * 1024;

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentDocumentTableName))) {
        await knex.schema.createTable(AiAgentDocumentTableName, (table) => {
            table
                .uuid('ai_agent_document_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable(OrganizationsTableName)
                .onDelete('CASCADE')
                .index()
                .comment('Owning organization.');

            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .comment(
                    'Optional project scope. Null means the document is available across the organization.',
                );

            table
                .string('name')
                .notNullable()
                .comment('Display name shown in the UI.');
            table
                .string('original_filename')
                .notNullable()
                .comment('Filename as uploaded by the user.');
            table
                .string('mime_type')
                .notNullable()
                .comment('MIME type of the original uploaded file.');

            table
                .text('content')
                .comment(
                    'Converted text (markdown or plain). Null when the document is stored in an external backend.',
                );
            table.integer('content_size_bytes').notNullable();

            table
                .jsonb('summary')
                .notNullable()
                .comment(
                    'Structured summary (description, definedTerms, relatedExploreNames, useWhen, relevance, warning) used by agents to decide whether to read the full content.',
                );

            table
                .string('storage_key')
                .notNullable()
                .unique()
                .comment(
                    'Canonical storage address for the content, portable across storage backends.',
                );

            table
                .uuid('created_by_user_uuid')
                .references('user_uuid')
                .inTable(UsersTableName)
                .onDelete('SET NULL')
                .comment('User who uploaded the document.');
            table
                .uuid('updated_by_user_uuid')
                .references('user_uuid')
                .inTable(UsersTableName)
                .onDelete('SET NULL')
                .comment('User who last modified the document.');

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });

        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ai_agent_document_content_size_check
             CHECK (content_size_bytes >= 0 AND content_size_bytes <= ${MAX_CONTENT_BYTES})`,
            [AiAgentDocumentTableName],
        );
    }

    if (!(await knex.schema.hasTable(AiAgentDocumentAccessTableName))) {
        await knex.schema.createTable(
            AiAgentDocumentAccessTableName,
            (table) => {
                table
                    .uuid('ai_agent_document_uuid')
                    .notNullable()
                    .references('ai_agent_document_uuid')
                    .inTable(AiAgentDocumentTableName)
                    .onDelete('CASCADE')
                    .index()
                    .comment('Document being granted to an agent.');
                table
                    .uuid('ai_agent_uuid')
                    .notNullable()
                    .references('ai_agent_uuid')
                    .inTable(AiAgentTableName)
                    .onDelete('CASCADE')
                    .index()
                    .comment(
                        'Agent that can access the document. Absence of any rows for a document means it is available to all agents in the organization.',
                    );
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.unique(['ai_agent_document_uuid', 'ai_agent_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentDocumentAccessTableName);
    await knex.schema.dropTableIfExists(AiAgentDocumentTableName);
}
