import { Knex } from 'knex';

const USER_ATTRIBUTES_TABLE = 'user_attributes';
const MANAGED_COLUMN = 'managed';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(USER_ATTRIBUTES_TABLE, (table) => {
        // Provenance flag: true when the attribute is declared as instance
        // config (LD_SETUP_USER_ATTRIBUTES) rather than created in the UI.
        // Enforcement (locking UI edits) is deferred; this column lands now so
        // it doesn't need an un-backfillable retrofit later.
        table.boolean(MANAGED_COLUMN).notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(USER_ATTRIBUTES_TABLE, (table) => {
        table.dropColumn(MANAGED_COLUMN);
    });
}
