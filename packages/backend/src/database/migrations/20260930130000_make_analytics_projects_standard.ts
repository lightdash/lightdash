import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // DEFAULT is supported by previous releases. Keep the provisioning marker
    // and all project identity/content fields intact so old code can still use
    // these managed projects when migrations run before the application update.
    await knex<{ provisioning_source: string; project_type: string }>(
        'projects',
    )
        .where({ provisioning_source: 'analytics', project_type: 'PREVIEW' })
        .update({ project_type: 'DEFAULT' });
}

export async function down(knex: Knex): Promise<void> {
    await knex<{ provisioning_source: string; project_type: string }>(
        'projects',
    )
        .where({ provisioning_source: 'analytics', project_type: 'DEFAULT' })
        .update({ project_type: 'PREVIEW' });
}
