import { Knex } from 'knex';

const MobileAppLinksTableName = 'mobile_app_links';
const MobileAppLinkRateCountersTableName = 'mobile_app_link_rate_counters';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(MobileAppLinksTableName, (table) => {
        table
            .uuid('mobile_app_link_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('scan_id_hash').notNullable().unique();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('expires_at', { useTz: true }).notNullable().index();
        table.timestamp('first_scanned_at', { useTz: true }).nullable();
        table.text('first_scan_platform').nullable();
        table.integer('scan_count').notNullable().defaultTo(0);
    });
    await knex.schema.createTable(
        MobileAppLinkRateCountersTableName,
        (table) => {
            table.text('key_hash').notNullable();
            table.text('operation').notNullable();
            table
                .timestamp('window_started_at', { useTz: true })
                .notNullable()
                .index();
            table.integer('request_count').notNullable().defaultTo(0);
            table.primary(['key_hash', 'operation', 'window_started_at']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(MobileAppLinkRateCountersTableName);
    await knex.schema.dropTableIfExists(MobileAppLinksTableName);
}
