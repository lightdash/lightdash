import { Knex } from 'knex';

const RolesTableName = 'roles';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RolesTableName, (table) => {
        table.text('level').notNullable().defaultTo('project');
    });

    await knex.raw(`
        ALTER TABLE roles
            ADD CONSTRAINT roles_level_check
                CHECK (level IN ('project', 'organization'))
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE roles
            DROP CONSTRAINT IF EXISTS roles_level_check
    `);

    await knex.schema.alterTable(RolesTableName, (table) => {
        table.dropColumn('level');
    });
}
