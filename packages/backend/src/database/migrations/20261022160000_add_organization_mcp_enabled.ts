import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable('organization_settings', (table) => {
            table.boolean('mcp_enabled').nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable('organization_settings', (table) => {
            table.dropColumn('mcp_enabled');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
