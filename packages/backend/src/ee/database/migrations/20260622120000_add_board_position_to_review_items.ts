import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(reviewItemTable, (table) => {
        // Fractional manual sort key for the review board. Null = fall back to
        // the default (last-seen) order; a drag-reorder sets the midpoint
        // between neighbours so only one row updates.
        table.double('board_position').nullable();
    });
}

export async function down(_knex: Knex): Promise<void> {
    // Dropping a column is a disallowed, data-losing operation; this down
    // migration is intentionally a no-op (the nullable column is harmless if
    // the code is rolled back).
}
