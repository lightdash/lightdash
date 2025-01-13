import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.withSchema('graphile_worker').hasTable('jobs')) {
        await knex.raw(`
            UPDATE graphile_worker.jobs
            SET payload = jsonb_set(
                    payload::jsonb, -- Cast payload to jsonb
                    '{data}', -- Path to the key to redact
                    '""', -- Value to replace with
                    true -- Create the key if it doesn't exist
                          )
            WHERE task_identifier = 'createProjectWithCompile';
        `);
    }
}

export async function down(knex: Knex): Promise<void> {
    // non applicable
}
