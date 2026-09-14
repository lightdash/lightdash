import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a platform column with a default that matches every existing row',
} as const;

const installationsTable = 'mobile_push_installations';
const platformCheckConstraint = 'mobile_push_installations_platform_check';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(installationsTable, (table) => {
        table
            .text('platform')
            .notNullable()
            .defaultTo('ios')
            .checkIn(['ios', 'android'], platformCheckConstraint);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(installationsTable, (table) => {
        table.dropColumn('platform');
    });
}
