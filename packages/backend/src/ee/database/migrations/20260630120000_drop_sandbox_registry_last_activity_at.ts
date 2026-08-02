import { Knex } from 'knex';

const SandboxRegistryTableName = 'sandbox_registry';

// `last_activity_at` (and its `(status, last_activity_at)` index) only ever
// served the idle/snapshot reaper, which has been removed: every turn suspends
// its own sandbox, and native-pause backends (E2B, Lambda MicroVMs) own idle
// expiry themselves. Drop the now-unread column so the registry holds only
// lifecycle state.
export async function up(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            SandboxRegistryTableName,
            'last_activity_at',
        )
    ) {
        await knex.schema.alterTable(SandboxRegistryTableName, (table) => {
            table.dropIndex(['status', 'last_activity_at']);
            table.dropColumn('last_activity_at');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(
            SandboxRegistryTableName,
            'last_activity_at',
        ))
    ) {
        await knex.schema.alterTable(SandboxRegistryTableName, (table) => {
            table
                .timestamp('last_activity_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.index(['status', 'last_activity_at']);
        });
    }
}
