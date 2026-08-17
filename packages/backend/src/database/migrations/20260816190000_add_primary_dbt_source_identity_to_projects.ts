import { Knex } from 'knex';

const tableName = 'projects';
const projectDbtSourcesTableName = 'project_dbt_sources';
const DEFAULT_PROJECT_DBT_SOURCE_NAME = 'dbt_project';

export const getAvailablePrimaryDbtSourceName = (
    sourceNames: ReadonlySet<string>,
): string => {
    if (!sourceNames.has(DEFAULT_PROJECT_DBT_SOURCE_NAME)) {
        return DEFAULT_PROJECT_DBT_SOURCE_NAME;
    }

    let suffix = 1;
    let sourceName = `${DEFAULT_PROJECT_DBT_SOURCE_NAME}_${suffix}`;
    while (sourceNames.has(sourceName)) {
        suffix += 1;
        sourceName = `${DEFAULT_PROJECT_DBT_SOURCE_NAME}_${suffix}`;
    }

    return sourceName;
};

export const classification = {
    kind: 'safe',
    reason: 'Adds and backfills new project dbt source identity columns without removing or reinterpreting existing data',
};

/**
 * Gives each project's primary dbt source a stable identity. The UUID can
 * become the project_dbt_sources row primary key in a staged future migration.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.alterTable(tableName, (tableBuilder) => {
        tableBuilder.uuid('dbt_source_uuid').nullable();
        tableBuilder
            .string('dbt_source_name', 255)
            .notNullable()
            .defaultTo(DEFAULT_PROJECT_DBT_SOURCE_NAME);
    });

    await knex<{ dbt_source_uuid: string | null }>(tableName)
        .whereNull('dbt_source_uuid')
        .update({ dbt_source_uuid: knex.raw('uuid_generate_v4()') });

    const projects = await knex<{ project_uuid: string }>(tableName).select(
        'project_uuid',
    );
    const additionalSources = await knex<{
        project_uuid: string;
        name: string;
    }>(projectDbtSourcesTableName).select('project_uuid', 'name');
    const sourceNamesByProject = new Map<string, Set<string>>();

    additionalSources.forEach(({ project_uuid: projectUuid, name }) => {
        const sourceNames =
            sourceNamesByProject.get(projectUuid) ?? new Set<string>();
        sourceNames.add(name);
        sourceNamesByProject.set(projectUuid, sourceNames);
    });

    await Promise.all(
        projects.flatMap(({ project_uuid: projectUuid }) => {
            const sourceNames = sourceNamesByProject.get(projectUuid);
            if (!sourceNames) {
                return [];
            }

            const sourceName = getAvailablePrimaryDbtSourceName(sourceNames);
            if (sourceName === DEFAULT_PROJECT_DBT_SOURCE_NAME) {
                return [];
            }

            return [
                knex<{ dbt_source_name: string }>(tableName)
                    .where('project_uuid', projectUuid)
                    .update({ dbt_source_name: sourceName }),
            ];
        }),
    );

    await knex.schema.alterTable(tableName, (tableBuilder) => {
        tableBuilder
            .uuid('dbt_source_uuid')
            .nullable()
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(tableName, (tableBuilder) => {
        tableBuilder.dropColumns('dbt_source_uuid', 'dbt_source_name');
    });
}
