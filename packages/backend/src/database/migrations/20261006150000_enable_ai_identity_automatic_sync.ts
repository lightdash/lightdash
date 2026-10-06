import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Keeps the old sync column for rolling deploys and enables existing AI identity accounts.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex('ai_identity_automatic_sync')
        .where({ enabled: false })
        .update({ enabled: true });
    await knex.schema.alterTable('ai_identity_automatic_sync', (table) => {
        table.boolean('enabled').notNullable().defaultTo(true).alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_automatic_sync', (table) => {
        table.boolean('enabled').notNullable().defaultTo(false).alter();
    });
    await knex('ai_identity_automatic_sync').update({ enabled: false });
}
