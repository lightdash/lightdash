import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const AI_ORG_PROVIDER_CREDENTIAL_TABLE = 'ai_organization_provider_credential';
const CREDENTIAL_COLUMN = 'ai_organization_provider_credential_uuid';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable FK column to ai_agent. Existing rows keep null, which resolves credentials exactly as before this migration (project pin, then organization default), so no agent changes behaviour until an admin pins one.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasColumn(AI_AGENT_TABLE, CREDENTIAL_COLUMN))) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                // Credential this agent's prompts run on. Null means the
                // project pin or organization default applies.
                //
                // RESTRICT, not SET NULL: dropping to the project or org
                // default would silently move a pinned agent's prompts to
                // another region. Deleting a credential an agent uses must
                // fail so an admin repoints the agent deliberately.
                table
                    .uuid(CREDENTIAL_COLUMN)
                    .nullable()
                    .references(CREDENTIAL_COLUMN)
                    .inTable(AI_ORG_PROVIDER_CREDENTIAL_TABLE)
                    .onDelete('RESTRICT')
                    .index();
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasColumn(AI_AGENT_TABLE, CREDENTIAL_COLUMN)) {
            await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
                table.dropColumn(CREDENTIAL_COLUMN);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
