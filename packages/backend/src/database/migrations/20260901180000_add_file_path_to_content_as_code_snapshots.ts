import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column recording the repo file each snapshot was applied from',
} as const;

const SNAPSHOTS_TABLE = 'content_as_code_snapshots';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(SNAPSHOTS_TABLE, (table) => {
        table.text('file_path').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(SNAPSHOTS_TABLE, (table) => {
        table.dropColumn('file_path');
    });
}
