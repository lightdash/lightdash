import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable capability limit without rewriting saved policies. Old application versions ignore the new limit until they are replaced.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(
        'organization_agent_capability_policies',
        (table) => {
            table.specificType('allowed_capabilities', 'text[]').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(
        'organization_agent_capability_policies',
        (table) => {
            table.dropColumn('allowed_capabilities');
        },
    );
}
