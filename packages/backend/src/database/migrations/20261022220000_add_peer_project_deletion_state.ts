import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable project deletion state without changing existing project or source rows',
};

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '5s'");
        await trx.raw(`
            ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS project_peer_deletion_started_at timestamptz NULL
        `);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '5s'");
        await trx.raw('LOCK TABLE projects IN ACCESS EXCLUSIVE MODE');
        const active = await trx('projects')
            .whereNotNull('project_peer_deletion_started_at')
            .first('project_uuid');
        if (active)
            throw new Error(
                'irreversible: finish active peer project deletions before removing deletion state',
            );
        await trx.raw("SET LOCAL lock_timeout = '5s'");
        await trx.raw(`
            ALTER TABLE projects
            DROP COLUMN IF EXISTS project_peer_deletion_started_at
        `);
    });
}
