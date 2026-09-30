import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
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
