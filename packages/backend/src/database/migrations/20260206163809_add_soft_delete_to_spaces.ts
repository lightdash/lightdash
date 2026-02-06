import { Knex } from 'knex';

const SpacesTableName = 'spaces';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.timestamp('deleted_at', { useTz: false }).nullable();
        table.uuid('deleted_by_user_uuid').nullable();
    });

    // Partial index for fast queries on non-deleted items
    await knex.raw(`
        CREATE INDEX idx_spaces_not_deleted
        ON ${SpacesTableName} (space_uuid)
        WHERE deleted_at IS NULL
    `);

    // Partial index for fast queries on deleted items (Recently Deleted page)
    await knex.raw(`
        CREATE INDEX idx_spaces_deleted
        ON ${SpacesTableName} (space_uuid)
        WHERE deleted_at IS NOT NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS idx_spaces_deleted');
    await knex.raw('DROP INDEX IF EXISTS idx_spaces_not_deleted');
    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.dropColumn('deleted_at');
        table.dropColumn('deleted_by_user_uuid');
    });
}
