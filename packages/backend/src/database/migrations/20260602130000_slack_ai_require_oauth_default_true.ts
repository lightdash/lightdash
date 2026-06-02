import { Knex } from 'knex';

// Make AI agents in Slack require OAuth by default. This only changes the
// column DEFAULT for NEW Slack installations — existing rows keep whatever
// value they already have, so current installs are not silently flipped.
// Requiring OAuth means each Slack user resolves to their real Lightdash
// identity, so per-user permissions and user-attribute access controls apply
// (otherwise the agent acts as the workspace installer).
export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        'ALTER TABLE slack_auth_tokens ALTER COLUMN ai_require_oauth SET DEFAULT true',
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        'ALTER TABLE slack_auth_tokens ALTER COLUMN ai_require_oauth SET DEFAULT false',
    );
}
