import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column that records who declined a mobile sign-in code. Existing rows keep NULL and the previous release never reads the column.',
} as const;

const tableName = 'mobile_sign_in_codes';
const columnName = 'declined_by';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);

    if (!(await knex.schema.hasColumn(tableName, columnName))) {
        await knex.schema.alterTable(tableName, (tableBuilder) => {
            tableBuilder.text(columnName).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);

    if (await knex.schema.hasColumn(tableName, columnName)) {
        await knex.schema.alterTable(tableName, (tableBuilder) => {
            tableBuilder.dropColumn(columnName);
        });
    }
}
