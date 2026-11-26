import { type Knex } from 'knex';

const policyTable = 'organization_agent_capability_policies';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(policyTable, (table) => {
        table.dropColumn('mode');
    });
}

export async function down(): Promise<void> {
    throw new Error('irreversible: the dropped mode values are not kept');
}
