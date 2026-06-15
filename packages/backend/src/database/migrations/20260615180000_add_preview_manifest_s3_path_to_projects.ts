import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        // S3 key of a pre-combined manifest.json. When set, UI-created previews
        // of this project source their manifest from here instead of asking the
        // user to paste/upload one (for large multi-repo combined manifests).
        table.text('preview_manifest_s3_path').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('preview_manifest_s3_path');
    });
}
