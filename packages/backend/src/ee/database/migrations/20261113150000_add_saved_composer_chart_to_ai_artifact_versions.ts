import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column and a NOT VALID foreign key, both metadata-only; a later migration validates it and builds its index concurrently.',
};

const AiArtifactVersionsTable = 'ai_artifact_versions';
const ConstraintName = 'ai_artifact_versions_saved_composer_chart_uuid_foreign';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw(
        `ALTER TABLE ${AiArtifactVersionsTable}
         ADD COLUMN IF NOT EXISTS saved_composer_chart_uuid uuid NULL`,
    );
    await knex.raw(
        `ALTER TABLE ${AiArtifactVersionsTable}
         ADD CONSTRAINT ${ConstraintName}
         FOREIGN KEY (saved_composer_chart_uuid)
         REFERENCES composer_charts (composer_chart_uuid)
         ON DELETE SET NULL NOT VALID`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw(
        `ALTER TABLE ${AiArtifactVersionsTable} DROP COLUMN IF EXISTS saved_composer_chart_uuid`,
    );
}
