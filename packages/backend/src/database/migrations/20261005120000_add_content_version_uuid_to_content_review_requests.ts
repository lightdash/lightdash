import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable content_version_uuid column and widens the content_type check to accept documents; existing rows stay valid and the previous release never writes the new value',
} as const;

const ContentReviewRequestsTableName = 'content_review_requests';
const DocumentVersionsTableName = 'document_versions';
const CONTENT_TYPE_CHECK = 'content_review_requests_content_type_check';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    // The Document version a review request was submitted for
    await knex.schema.alterTable(ContentReviewRequestsTableName, (table) => {
        table
            .uuid('content_version_uuid')
            .nullable()
            .references('document_version_uuid')
            .inTable(DocumentVersionsTableName)
            .onDelete('SET NULL')
            .index();
    });
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
    await knex.schema.alterTable(ContentReviewRequestsTableName, (table) => {
        table.dropColumn('content_version_uuid');
    });
}
