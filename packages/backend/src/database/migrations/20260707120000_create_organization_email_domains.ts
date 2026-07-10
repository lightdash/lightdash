import { Knex } from 'knex';

const ORGANIZATION_EMAIL_DOMAINS_TABLE = 'organization_email_domains';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ORGANIZATION_EMAIL_DOMAINS_TABLE, (table) => {
        table
            .uuid('organization_email_domain_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        // Domain (or subdomain) emails are sent from, e.g. reports.customer.com
        table.string('domain').notNullable();
        // Address & display name used in the From header
        table.string('from_email').notNullable();
        table.string('from_name').nullable();

        // Provider (Postmark) domain identifier, set once provisioned
        table.integer('postmark_domain_id').nullable();

        // DKIM DNS record (TXT) the customer must add
        table.string('dkim_host').nullable();
        table.text('dkim_value').nullable();
        table.boolean('dkim_verified').notNullable().defaultTo(false);

        // Return-path DNS record (CNAME) the customer must add. Must be
        // "DNS Only" at Cloudflare — proxying it breaks verification.
        table.string('return_path_host').nullable();
        table.string('return_path_value').nullable();
        table.boolean('return_path_verified').notNullable().defaultTo(false);

        // Admin toggle — can only be true once both records verify
        table.boolean('is_enabled').notNullable().defaultTo(false);

        // Async verification bookkeeping (poller with timeout)
        table.timestamp('verification_started_at', { useTz: false }).nullable();
        table.timestamp('last_checked_at', { useTz: false }).nullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Single sending domain per organization (UI ships single-domain).
        table.unique(['organization_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ORGANIZATION_EMAIL_DOMAINS_TABLE);
}
