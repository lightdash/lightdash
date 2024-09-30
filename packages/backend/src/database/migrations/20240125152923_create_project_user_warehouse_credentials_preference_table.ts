import { Knex } from 'knex';

const projectUserWarehouseCredentialsPreferenceTableName =
    'project_user_warehouse_credentials_preference';

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasTable(
            projectUserWarehouseCredentialsPreferenceTableName,
        ))
    ) {
        await knex.schema.createTable(
            projectUserWarehouseCredentialsPreferenceTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('user_uuid')
                    .notNullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('project_uuid')
                    .notNullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('user_warehouse_credentials_uuid')
                    .notNullable()
                    .references('user_warehouse_credentials_uuid')
                    .inTable('user_warehouse_credentials')
                    .onDelete('CASCADE');
                tableBuilder.unique(['user_uuid', 'project_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(
        projectUserWarehouseCredentialsPreferenceTableName,
    );
}
