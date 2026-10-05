import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Widens the content_type check on content review requests to accept documents; existing rows stay valid and the previous release never writes the new value',
} as const;

const ContentReviewRequestsTableName = 'content_review_requests';
const CONTENT_TYPE_CHECK = 'content_review_requests_content_type_check';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE ${ContentReviewRequestsTableName}
        DROP CONSTRAINT IF EXISTS ${CONTENT_TYPE_CHECK}
    `);
    await knex.raw(`
        ALTER TABLE ${ContentReviewRequestsTableName}
        ADD CONSTRAINT ${CONTENT_TYPE_CHECK}
        CHECK (content_type IN ('chart', 'dashboard', 'sql_chart', 'document'))
        NOT VALID
    `);
    await knex.raw(`
        ALTER TABLE ${ContentReviewRequestsTableName}
        VALIDATE CONSTRAINT ${CONTENT_TYPE_CHECK}
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE ${ContentReviewRequestsTableName}
        DROP CONSTRAINT IF EXISTS ${CONTENT_TYPE_CHECK}
    `);
    // NOT VALID keeps Document requests made while the migration was applied
    await knex.raw(`
        ALTER TABLE ${ContentReviewRequestsTableName}
        ADD CONSTRAINT ${CONTENT_TYPE_CHECK}
        CHECK (content_type IN ('chart', 'dashboard', 'sql_chart'))
        NOT VALID
    `);
}
