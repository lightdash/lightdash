import { Knex } from 'knex';

const AiToolUserInputTableName = 'ai_tool_user_input';
const UsersTableName = 'users';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table for the input a user gives an agent tool. Raw SQL only sets a lock timeout; existing tables and data are unchanged.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(AiToolUserInputTableName))) {
            await knex.schema.createTable(AiToolUserInputTableName, (table) => {
                // Tool call id from the agent run is the natural primary key:
                // each call takes user input at most once.
                table.text('tool_call_id').primary();
                table.text('tool_name').notNullable();
                table
                    .jsonb('input')
                    .notNullable()
                    .comment(
                        'What the user submitted, as the tool reads it on resume.',
                    );
                table
                    .uuid('user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('SET NULL')
                    .index();
                table
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now())
                    .index();
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiToolUserInputTableName);
}
