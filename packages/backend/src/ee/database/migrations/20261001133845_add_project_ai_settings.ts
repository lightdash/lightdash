import { Knex } from 'knex';

const PROJECT_AI_SETTINGS_TABLE = 'project_ai_settings';
const AI_ORG_PROVIDER_CREDENTIAL_TABLE = 'ai_organization_provider_credential';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table holding at most one row per project. A project with no row keeps resolving the organization default credential, which is the behaviour before this migration, so nothing changes for existing installs.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(PROJECT_AI_SETTINGS_TABLE))) {
            await knex.schema.createTable(
                PROJECT_AI_SETTINGS_TABLE,
                (table) => {
                    // One row per project, so the project uuid is the key.
                    table
                        .uuid('project_uuid')
                        .primary()
                        .references('project_uuid')
                        .inTable('projects')
                        .onDelete('CASCADE');

                    // Credential this project's AI features run on. Null (or no
                    // row at all) means the organization default.
                    //
                    // RESTRICT, not SET NULL: dropping to the org default would
                    // silently move a pinned project's prompts to another
                    // region. Deleting a credential a project uses must fail so
                    // an admin repoints the project deliberately.
                    table
                        .uuid('ai_organization_provider_credential_uuid')
                        .nullable()
                        .references('ai_organization_provider_credential_uuid')
                        .inTable(AI_ORG_PROVIDER_CREDENTIAL_TABLE)
                        .onDelete('RESTRICT')
                        .index();

                    table
                        .timestamp('created_at', { useTz: false })
                        .notNullable()
                        .defaultTo(knex.fn.now());
                    table
                        .timestamp('updated_at', { useTz: false })
                        .notNullable()
                        .defaultTo(knex.fn.now());
                },
            );
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasTable(PROJECT_AI_SETTINGS_TABLE)) {
            await knex.schema.dropTable(PROJECT_AI_SETTINGS_TABLE);
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
