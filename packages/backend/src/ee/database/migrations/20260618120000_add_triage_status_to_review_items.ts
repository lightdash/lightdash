import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';
const statusConstraint = 'ai_agent_review_item_status_check';

const statusesWithTriage = [
    'triage',
    'open',
    'in_progress',
    'resolved',
    'dismissed',
    'duplicate',
];

const statusesWithoutTriage = [
    'open',
    'in_progress',
    'resolved',
    'dismissed',
    'duplicate',
];

const setStatusConstraint = async (
    knex: Knex,
    allowed: string[],
): Promise<void> => {
    const list = allowed.map((v) => `'${v}'`).join(', ');
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        reviewItemTable,
        statusConstraint,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (status IN (${list}))`,
        [reviewItemTable, statusConstraint],
    );
};

export async function up(knex: Knex): Promise<void> {
    await setStatusConstraint(knex, statusesWithTriage);
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN status SET DEFAULT 'triage'`, [
        reviewItemTable,
    ]);
    await knex.raw(`UPDATE ?? SET status = 'triage' WHERE status = 'open'`, [
        reviewItemTable,
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`UPDATE ?? SET status = 'open' WHERE status = 'triage'`, [
        reviewItemTable,
    ]);
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN status SET DEFAULT 'open'`, [
        reviewItemTable,
    ]);
    await setStatusConstraint(knex, statusesWithoutTriage);
}
