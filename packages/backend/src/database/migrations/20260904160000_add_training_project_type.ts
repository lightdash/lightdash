import { Knex } from 'knex';

// Values copied here on purpose: migrations never import application enums.
const ProjectTypeTableName = 'project_type';
const ProjectTypeColumn = 'project_type';
const TrainingProjectType = 'TRAINING';

/**
 * Registers the TRAINING project type (sample-data training project, one per
 * organization, created only by internal provisioning). `projects.project_type`
 * references this lookup table, so the value must exist before a training
 * project can be inserted.
 */
export async function up(knex: Knex): Promise<void> {
    await knex(ProjectTypeTableName)
        .insert({ [ProjectTypeColumn]: TrainingProjectType })
        .onConflict(ProjectTypeColumn)
        .ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex(ProjectTypeTableName)
        .where(ProjectTypeColumn, TrainingProjectType)
        .delete();
}
