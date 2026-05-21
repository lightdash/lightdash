import { Knex } from 'knex';

const AiSqlApprovalTableName = 'ai_sql_approval';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiSqlApprovalTableName, (table) => {
        // Tool call id from the agent run is the natural primary key —
        // each call is decided at most once.
        table.text('tool_call_id').primary();
        table.text('decision').notNullable();
        table.uuid('decided_by_user_uuid').nullable();
        table
            .timestamp('decided_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Audit trail FK — null on user deletion so we don't lose the row.
        table
            .foreign('decided_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');

        // Index for periodic cleanup of stale rows.
        table.index('decided_at', 'ai_sql_approval_decided_at_idx');
    });

    await knex.raw(`
        ALTER TABLE ${AiSqlApprovalTableName}
        ADD CONSTRAINT ai_sql_approval_decision_check
        CHECK (decision IN ('approved', 'rejected'))
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiSqlApprovalTableName);
}
