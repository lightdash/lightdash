import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.timestamp('deleted_at', { useTz: false }).nullable();
        table.uuid('deleted_by_user_uuid').nullable(); // No FK constraint - user may be deleted
    });

    // Partial index for fast queries on non-deleted items
    await knex.raw(`
        CREATE INDEX idx_scheduler_not_deleted
        ON ${SchedulerTableName} (scheduler_uuid)
        WHERE deleted_at IS NULL
    `);

    // Partial index for fast queries on deleted items
    await knex.raw(`
        CREATE INDEX idx_scheduler_deleted
        ON ${SchedulerTableName} (scheduler_uuid)
        WHERE deleted_at IS NOT NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS idx_scheduler_deleted');
    await knex.raw('DROP INDEX IF EXISTS idx_scheduler_not_deleted');
    await knex.schema.alterTable(SchedulerTableName, (table) => {
        table.dropColumn('deleted_at');
        table.dropColumn('deleted_by_user_uuid');
    });
}
