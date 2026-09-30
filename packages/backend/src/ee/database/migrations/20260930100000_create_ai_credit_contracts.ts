import { Knex } from 'knex';

const ContractsTableName = 'ai_credit_contracts';
const HoldsTableName = 'ai_credit_holds';
const OrganizationsTableName = 'organizations';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table and adds nullable columns to ai_credit_holds, a small table written only when an allowance runs out. Raw SQL only sets a lock timeout, generates UUID defaults and creates a partial unique index on the holds table; existing rows are unchanged.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(ContractsTableName))) {
            await knex.schema.createTable(ContractsTableName, (table) => {
                table
                    .uuid('ai_credit_contract_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('organization_uuid')
                    .notNullable()
                    .unique()
                    .references('organization_uuid')
                    .inTable(OrganizationsTableName)
                    .onDelete('CASCADE');
                table
                    .timestamp('starts_at', { useTz: true })
                    .notNullable()
                    .comment('Every allowance window is counted from here.');
                table.timestamp('ends_at', { useTz: true }).nullable();
                table.integer('reset_interval_months').notNullable();
                table
                    .decimal('allowance_credits', 18, 6)
                    .nullable()
                    .comment(
                        'Credits per window. Null until an allowance is agreed.',
                    );
                table
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('updated_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.check(
                    'reset_interval_months > 0',
                    [],
                    'ai_credit_contracts_reset_interval_check',
                );
                table.check(
                    'ends_at IS NULL OR ends_at > starts_at',
                    [],
                    'ai_credit_contracts_period_check',
                );
            });
        }

        if (
            !(await knex.schema.hasColumn(
                HoldsTableName,
                'ai_credit_contract_uuid',
            ))
        ) {
            await knex.schema.alterTable(HoldsTableName, (table) => {
                table
                    .uuid('ai_credit_contract_uuid')
                    .nullable()
                    .references('ai_credit_contract_uuid')
                    .inTable(ContractsTableName)
                    .onDelete('CASCADE')
                    .index();
                table
                    .timestamp('window_start', { useTz: true })
                    .nullable()
                    .comment(
                        'Start of the contract window whose allowance ran out.',
                    );
                table
                    .decimal('exhausted_allowance_credits', 18, 6)
                    .nullable()
                    .comment(
                        'The allowance that ran out, so raising it lets a new hold be placed.',
                    );
            });
            // Concurrent sink calls race to place the hold; this keeps one per window and allowance, even after an early release.
            await knex.raw(
                `CREATE UNIQUE INDEX ai_credit_holds_allowance_exhausted_contract_window_unique ON ${HoldsTableName} (ai_credit_contract_uuid, window_start, exhausted_allowance_credits) WHERE reason = 'allowance_exhausted' AND ai_credit_contract_uuid IS NOT NULL`,
            );
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.raw(
            'DROP INDEX IF EXISTS ai_credit_holds_allowance_exhausted_contract_window_unique',
        );
        if (
            await knex.schema.hasColumn(
                HoldsTableName,
                'ai_credit_contract_uuid',
            )
        ) {
            await knex.schema.alterTable(HoldsTableName, (table) => {
                table.dropColumn('exhausted_allowance_credits');
                table.dropColumn('window_start');
                table.dropColumn('ai_credit_contract_uuid');
            });
        }
        await knex.schema.dropTableIfExists(ContractsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
