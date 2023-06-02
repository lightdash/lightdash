import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ValidationTableName))) {
        await knex.schema.createTable(ValidationTableName, (table) => {
            table.specificType(
                'validation_id',
                'INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
            );
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('saved_chart_uuid')
                .references('saved_query_uuid')
                .inTable('saved_queries')
                .onDelete('CASCADE');
            table
                .uuid('dashboard_uuid')
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('CASCADE');
            table.string('error').notNullable();
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table.string('error_type').notNullable();
            table.string('chart_name').nullable();
            table.string('field_name').nullable();
            table.string('model_name').nullable();

            table.index(['project_uuid']);
        });
    } else {
        await knex(ValidationTableName).whereNull('error_type').del();
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function down(knex: Knex): Promise<void> {}
