import { Knex } from 'knex';

const AiThreadFileTableName = 'ai_thread_file';
const AiThreadTableName = 'ai_thread';
const AiPromptTableName = 'ai_prompt';
const OrganizationsTableName = 'organizations';
const UsersTableName = 'users';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table. Raw SQL only sets a lock timeout, generates UUID defaults and creates a partial index on the new table; no existing table is altered.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasTable(AiThreadFileTableName)) return;
        await knex.schema.createTable(AiThreadFileTableName, (table) => {
            table
                .uuid('ai_thread_file_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable(OrganizationsTableName)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable(UsersTableName)
                .onDelete('SET NULL')
                .index()
                .comment('Uploader. Only they can claim or delete the file.');
            table
                .uuid('ai_thread_uuid')
                .nullable()
                .references('ai_thread_uuid')
                .inTable(AiThreadTableName)
                .onDelete('CASCADE')
                .index()
                .comment(
                    'Set when the file is sent with a prompt; the thread then owns it.',
                );
            table
                .uuid('ai_prompt_uuid')
                .nullable()
                .references('ai_prompt_uuid')
                .inTable(AiPromptTableName)
                .onDelete('CASCADE')
                .index();
            table.string('file_name', 255).notNullable();
            table
                .text('content')
                .notNullable()
                .comment(
                    'Normalized UTF-8 text: BOM stripped, LF line endings.',
                );
            table.integer('size_bytes').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.timestamp('claimed_at', { useTz: true }).nullable();
        });
        // The sweeper and the per-user quota only ever look at unclaimed rows.
        await knex.raw(
            `CREATE INDEX ai_thread_file_unclaimed_created_at ON ${AiThreadFileTableName} (created_at) WHERE ai_thread_uuid IS NULL`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(AiThreadFileTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
