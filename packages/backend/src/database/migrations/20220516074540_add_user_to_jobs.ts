import { Knex } from 'knex';

const COMPILE_JOB_TABLE_NAME = 'jobs';

export async function up(knex: Knex): Promise<void> {
    const [existingUserUuid] = await knex
        .table('users')
        .select('user_uuid')
        .limit(1);
    console.log('exising user', existingUserUuid?.user_uuid);
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder
            .uuid('user_uuid')
            .notNullable()
            .defaultTo(existingUserUuid ? existingUserUuid.user_uuid : null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(COMPILE_JOB_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('user_uuid');
    });
}
