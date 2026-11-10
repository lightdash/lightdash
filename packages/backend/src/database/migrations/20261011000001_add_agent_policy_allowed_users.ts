import { type Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(
        'organization_agent_capability_policies',
        (table) => {
            table.specificType('allowed_user_uuids', 'uuid[]').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(
        'organization_agent_capability_policies',
        (table) => {
            table.dropColumn('allowed_user_uuids');
        },
    );
}
