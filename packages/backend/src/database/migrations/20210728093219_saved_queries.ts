import { Knex } from 'knex';
import { DbSpace } from '../entities/spaces';

type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    created_at: Date;
    organization_id: number;
};

type ProjectTable = Knex.CompositeTableType<
    DbProject,
    Pick<DbProject, 'name' | 'organization_id'>,
    Pick<DbProject, 'name'>
>;

const primaryKeyAsGeneratedIdentity = (
    table: Knex.CreateTableBuilder,
    columnName: string,
): Knex.CreateTableBuilder => {
    table.specificType(
        columnName,
        `integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY`,
    );
    return table;
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('field_types', (table) => {
        table.text('field_type').notNullable().primary();
    });

    await knex('field_types').insert([
        {
            field_type: 'dimension',
        },
        {
            field_type: 'metric',
        },
    ]);

    await knex.schema.createTable('chart_types', (table) => {
        table.text('chart_type').notNullable().primary();
    });

    await knex('chart_types').insert([
        {
            chart_type: 'column',
        },
        {
            chart_type: 'bar',
        },
        {
            chart_type: 'line',
        },
        {
            chart_type: 'scatter',
        },
    ]);

    await knex.schema.createTable('projects', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'project_id');
        table
            .uuid('project_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('name').notNullable();
        table
            .integer('organization_id')
            .notNullable()
            .references('organization_id')
            .inTable('organizations')
            .onDelete('CASCADE');
    });

    await knex.schema.createTable('spaces', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'space_id');
        table
            .uuid('space_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('name').notNullable();
        table
            .integer('project_id')
            .notNullable()
            .references('project_id')
            .inTable('projects')
            .onDelete('CASCADE');
    });

    await knex.schema.createTable('saved_queries', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'saved_query_id');
        table
            .uuid('saved_query_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('name').notNullable();
        table
            .integer('space_id')
            .notNullable()
            .references('space_id')
            .inTable('spaces')
            .onDelete('CASCADE');
    });

    await knex.schema.createTable('saved_queries_versions', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'saved_queries_version_id');
        table
            .uuid('saved_queries_version_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('x_dimension');
        table.text('group_dimension');
        table.text('explore_name').notNullable();
        table.jsonb('filters').notNullable();
        table.integer('row_limit').notNullable();
        table
            .text('chart_type')
            .notNullable()
            .references('chart_type')
            .inTable('chart_types')
            .onDelete('RESTRICT');
        table
            .integer('saved_query_id')
            .notNullable()
            .references('saved_query_id')
            .inTable('saved_queries')
            .onDelete('CASCADE');
    });

    await knex.schema.createTable(
        'saved_queries_version_y_metrics',
        (table) => {
            primaryKeyAsGeneratedIdentity(
                table,
                'saved_queries_version_y_metric_id',
            );
            table.text('field_name').notNullable();
            table.integer('order').notNullable();
            table
                .integer('saved_queries_version_id')
                .notNullable()
                .references('saved_queries_version_id')
                .inTable('saved_queries_versions')
                .onDelete('CASCADE');
        },
    );

    await knex.schema.createTable('saved_queries_version_fields', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'saved_queries_version_field_id');
        table.text('name').notNullable();
        table.integer('order').notNullable();
        table
            .text('field_type')
            .notNullable()
            .references('field_type')
            .inTable('field_types')
            .onDelete('RESTRICT');
        table
            .integer('saved_queries_version_id')
            .notNullable()
            .references('saved_queries_version_id')
            .inTable('saved_queries_versions')
            .onDelete('CASCADE');
    });

    await knex.schema.createTable('saved_queries_version_sorts', (table) => {
        primaryKeyAsGeneratedIdentity(table, 'saved_queries_version_sort_id');
        table.text('field_name').notNullable();
        table.boolean('descending').notNullable();
        table.integer('order').notNullable();
        table
            .integer('saved_queries_version_id')
            .notNullable()
            .references('saved_queries_version_id')
            .inTable('saved_queries_versions')
            .onDelete('CASCADE');
    });

    const orgs = await knex('organizations')
        .select(['organization_id', 'organization_name'])
        .limit(1);

    if (orgs.length > 0) {
        const project = (
            await knex<ProjectTable>('projects')
                .insert({
                    name: orgs[0].organization_name,
                    organization_id: orgs[0].organization_id,
                })
                .returning('*')
        )[0];

        await knex<Pick<DbSpace, 'name' | 'project_id'>>('spaces')
            .insert({
                name: orgs[0].organization_name,
                project_id: project.project_id,
            })
            .returning('*');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('saved_queries_version_y_metrics');
    await knex.schema.dropTableIfExists('saved_queries_version_sorts');
    await knex.schema.dropTableIfExists('saved_queries_version_fields');
    await knex.schema.dropTableIfExists('saved_queries_versions');
    await knex.schema.dropTableIfExists('saved_queries');
    await knex.schema.dropTableIfExists('spaces');
    await knex.schema.dropTableIfExists('projects');
    await knex.schema.dropTableIfExists('field_types');
    await knex.schema.dropTableIfExists('chart_types');
}
