import { Knex } from 'knex';

const ContractsTableName = 'ai_credit_contracts';
const ModeCheckName = 'ai_credit_contracts_allowance_mode_check';

export const classification = {
    kind: 'safe',
    reason: 'Adds a not-null text column with a constant default to ai_credit_contracts, a small table with one row per organization, so Postgres stores the default without rewriting rows. Raw SQL only sets a lock timeout and adds a check constraint on the new column.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    if (await knex.schema.hasColumn(ContractsTableName, 'allowance_mode')) {
        return;
    }
    await knex.schema.alterTable(ContractsTableName, (table) => {
        table
            .text('allowance_mode')
            .notNullable()
            .defaultTo('warn')
            .comment(
                'warn keeps AI available past the allowance; enforce pauses billable AI until the hold lifts.',
            );
        table.check(`allowance_mode IN ('warn', 'enforce')`, [], ModeCheckName);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.schema.alterTable(ContractsTableName, (table) => {
        table.dropChecks([ModeCheckName]);
        table.dropColumn('allowance_mode');
    });
}
