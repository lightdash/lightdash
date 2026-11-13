import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Validates a NOT VALID foreign key under SHARE UPDATE EXCLUSIVE; reads and writes continue, and the column is only ever null on existing rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw('SET LOCAL statement_timeout = 0');
    await knex.raw(
        'ALTER TABLE ai_artifact_versions VALIDATE CONSTRAINT ai_artifact_versions_saved_composer_chart_uuid_foreign',
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw(
        `ALTER TABLE ai_artifact_versions
         DROP CONSTRAINT IF EXISTS ai_artifact_versions_saved_composer_chart_uuid_foreign`,
    );
    await knex.raw(
        `ALTER TABLE ai_artifact_versions
         ADD CONSTRAINT ai_artifact_versions_saved_composer_chart_uuid_foreign
         FOREIGN KEY (saved_composer_chart_uuid)
         REFERENCES composer_charts (composer_chart_uuid)
         ON DELETE SET NULL NOT VALID`,
    );
}
