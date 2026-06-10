import { Knex } from 'knex';

const ORGANIZATION_DOMAIN_VERIFICATIONS_TABLE =
    'organization_domain_verifications';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        ORGANIZATION_DOMAIN_VERIFICATIONS_TABLE,
        (table) => {
            table
                .uuid('domain_verification_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table.string('domain').notNullable();
            // null while a challenge is pending; set once the domain is verified
            table.timestamp('verified_at', { useTz: false }).nullable();
            table
                .uuid('verified_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            // bcrypt hash of the pending passcode, cleared once verified
            table.string('passcode').nullable();
            table.timestamp('passcode_created_at', { useTz: false }).nullable();
            table.integer('number_of_attempts').notNullable().defaultTo(0);
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            // One row per org+domain (pending or verified)
            table.unique(['organization_uuid', 'domain']);
        },
    );

    // Globally unique verified domains — first organization to verify a domain
    // owns it. Partial index so multiple orgs can have pending challenges for
    // the same domain, but only one can hold the verified row.
    await knex.raw(
        `CREATE UNIQUE INDEX organization_domain_verifications_verified_domain_unique
         ON ${ORGANIZATION_DOMAIN_VERIFICATIONS_TABLE} (domain)
         WHERE verified_at IS NOT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(
        ORGANIZATION_DOMAIN_VERIFICATIONS_TABLE,
    );
}
