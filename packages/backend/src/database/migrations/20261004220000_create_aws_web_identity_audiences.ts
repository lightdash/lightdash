import { Knex } from 'knex';

const AwsWebIdentityAudiencesTableName = 'aws_web_identity_audiences';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table. Raw SQL only sets a lock timeout; existing tables and data are unchanged.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(AwsWebIdentityAudiencesTableName, (table) => {
        table.text('audience').primary();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(AwsWebIdentityAudiencesTableName);
}
