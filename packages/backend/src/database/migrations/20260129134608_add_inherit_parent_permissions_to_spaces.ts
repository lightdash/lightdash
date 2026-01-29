import { Knex } from 'knex';

const SpacesTableName = 'spaces';
// NOTE: this new column will ultimately replace `is_private`.
// During the transition phase we'll need both.
const columnName = 'inherit_parent_permissions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.boolean(columnName).notNullable().defaultTo(true);
    });

    // Set initial values:
    // - Root spaces (parent_space_uuid IS NULL): inherit = !is_private
    //   (private spaces have their own permissions, public spaces inherit from project)
    // - Child spaces (parent_space_uuid IS NOT NULL): inherit = true
    //   (child spaces always inherit right now)
    await knex.raw(`
        UPDATE ${SpacesTableName}
        SET ${columnName} = NOT is_private
        WHERE parent_space_uuid IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.dropColumn(columnName);
    });
}
