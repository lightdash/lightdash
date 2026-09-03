import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty scim_request_logs table',
} as const;

const tableName = 'scim_request_logs';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (await knex.schema.hasTable(tableName)) return;

    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('scim_request_log_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        // SET NULL so deleting a SCIM token doesn't erase request history
        table
            .uuid('service_account_uuid')
            .nullable()
            .references('service_account_uuid')
            .inTable('service_accounts')
            .onDelete('SET NULL')
            .index();
        table.text('method').notNullable();
        table.text('url').notNullable();
        table.text('action').notNullable();
        table.text('target_identity').nullable();
        table.text('target_uuid').nullable();
        table.jsonb('affected_roles').notNullable().defaultTo('[]');
        table.integer('status').notNullable();
        table.text('error_detail').nullable();
        table.text('scim_type').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'created_at']);
        table.index('created_at');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(tableName);
}
