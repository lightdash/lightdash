import { Knex } from 'knex';

const tableName = 'project_dbt_sources';
const onePrimaryIndexName = 'project_dbt_sources_one_primary_per_project';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .uuid('project_dbt_source_uuid')
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
            tableBuilder
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            tableBuilder.string('name', 255).notNullable();
            // The primary source mirrors projects.dbt_connection (precedence 0);
            // only one primary per project (partial unique index below).
            tableBuilder.boolean('is_primary').notNullable().defaultTo(false);
            tableBuilder.integer('precedence').notNullable().defaultTo(0);
            // Per-source dbt connection (git/dbt-cloud), encrypted with the same
            // EncryptionUtil as projects.dbt_connection. The source is recompiled
            // from this connection at deploy/preview time.
            tableBuilder.text('dbt_connection_type').nullable();
            tableBuilder.binary('dbt_connection').nullable();
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            // unique(project_uuid, name) also serves as the FK-covering index for
            // project_uuid (leading column), so no separate FK index is needed.
            tableBuilder.unique(['project_uuid', 'name']);
        });

        // At most one primary source per project. Knex's builder has no partial
        // unique; the table is brand-new and empty so a plain index is free.
        await knex.raw(
            `CREATE UNIQUE INDEX ?? ON ?? (project_uuid) WHERE is_primary`,
            [onePrimaryIndexName, tableName],
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    // Pure-expand additive table; dropping it leaves projects.dbt_connection
    // (the single-source path) untouched — clean rollback.
    await knex.schema.dropTableIfExists(tableName);
}
