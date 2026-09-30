import { Knex } from 'knex';

const AlertsTableName = 'ai_credit_allowance_alerts';
const ContractsTableName = 'ai_credit_contracts';
const OrganizationsTableName = 'organizations';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table. Raw SQL only sets a lock timeout, generates UUID defaults and creates a partial index on the new table; no existing table is altered.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasTable(AlertsTableName)) return;
        await knex.schema.createTable(AlertsTableName, (table) => {
            table
                .uuid('ai_credit_allowance_alert_uuid')
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
                .uuid('ai_credit_contract_uuid')
                .notNullable()
                .references('ai_credit_contract_uuid')
                .inTable(ContractsTableName)
                .onDelete('CASCADE');
            table.timestamp('window_start', { useTz: true }).notNullable();
            table.integer('threshold_percent').notNullable();
            table
                .decimal('allowance_credits', 18, 6)
                .notNullable()
                .comment(
                    'The allowance the threshold was reached against, so a changed allowance can re-arm it.',
                );
            table.decimal('used_credits', 18, 6).notNullable();
            table
                .timestamp('reached_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('delivered_at', { useTz: true })
                .nullable()
                .comment('Null until the scheduler has notified the admins.');
            // Concurrent sink calls race to record the same threshold; this keeps one per window.
            table.unique(
                [
                    'ai_credit_contract_uuid',
                    'window_start',
                    'threshold_percent',
                ],
                {
                    indexName:
                        'ai_credit_allowance_alerts_contract_window_threshold_unique',
                },
            );
            table.check(
                'threshold_percent IN (50, 80, 100)',
                [],
                'ai_credit_allowance_alerts_threshold_check',
            );
        });
        await knex.raw(
            `CREATE INDEX ai_credit_allowance_alerts_undelivered ON ${AlertsTableName} (reached_at) WHERE delivered_at IS NULL`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(AlertsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
