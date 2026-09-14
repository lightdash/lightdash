import { Knex } from 'knex';

const ANNOUNCEMENTS_TABLE = 'project_announcements';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
        // DEFAULT now() means existing rows stay published; new drafts
        // explicitly insert null.
        table
            .timestamp('published_at', { useTz: false })
            .nullable()
            .defaultTo(knex.fn.now());
        table.text('pending_slack_channel_id').nullable();
    });
    // The default only exists to backfill existing rows as published; new rows
    // must state whether they are a draft.
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN published_at DROP DEFAULT`,
        ANNOUNCEMENTS_TABLE,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
        table.dropColumn('published_at');
        table.dropColumn('pending_slack_channel_id');
    });
}
