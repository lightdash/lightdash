import { Knex } from 'knex';

const AI_ORG_PROVIDER_CREDENTIAL_TABLE = 'ai_organization_provider_credential';
const DEFAULT_UNIQUE_INDEX = 'ai_organization_provider_credential_default_uniq';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table. Nothing reads or writes it yet: the legacy encrypted_provider_api_keys blob on ai_organization_settings stays authoritative until an organization has credential rows, so no existing behaviour changes.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(AI_ORG_PROVIDER_CREDENTIAL_TABLE))) {
            await knex.schema.createTable(
                AI_ORG_PROVIDER_CREDENTIAL_TABLE,
                (table) => {
                    table
                        .uuid('ai_organization_provider_credential_uuid')
                        .primary()
                        .defaultTo(knex.raw('uuid_generate_v4()'));

                    table
                        .uuid('organization_uuid')
                        .notNullable()
                        .references('organization_uuid')
                        .inTable('organizations')
                        .onDelete('CASCADE')
                        .index();

                    table.string('provider').notNullable();
                    table.string('label').notNullable();
                    table.binary('encrypted_config').notNullable();

                    // Credential serving AI paths with no project or agent in
                    // scope. Lives here rather than as a pointer on
                    // ai_organization_settings so deleting a credential cannot
                    // strand a dangling default.
                    table.boolean('is_default').notNullable().defaultTo(false);

                    table
                        .uuid('created_by_user_uuid')
                        .nullable()
                        .references('user_uuid')
                        .inTable('users')
                        .onDelete('SET NULL')
                        .index();

                    table
                        .timestamp('created_at', { useTz: false })
                        .notNullable()
                        .defaultTo(knex.fn.now());
                    table
                        .timestamp('updated_at', { useTz: false })
                        .notNullable()
                        .defaultTo(knex.fn.now());

                    // Labels are how an admin tells two regions apart in the
                    // project picker, so they must be unique within an org.
                    table.unique(['organization_uuid', 'label']);
                },
            );

            await knex.raw(`
                CREATE UNIQUE INDEX ${DEFAULT_UNIQUE_INDEX}
                ON ${AI_ORG_PROVIDER_CREDENTIAL_TABLE} (organization_uuid)
                WHERE is_default
            `);
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasTable(AI_ORG_PROVIDER_CREDENTIAL_TABLE)) {
            await knex.schema.dropTable(AI_ORG_PROVIDER_CREDENTIAL_TABLE);
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
