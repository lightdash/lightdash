import { ChartKind } from '@lightdash/common';
import { Knex } from 'knex';

export const SAVED_SQL_TABLE_NAME = 'saved_sql';
export const SAVED_SQL_VERSIONS_TABLE_NAME = 'saved_sql_versions';
const customSearchConfigName = `lightdash_english_config`;

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SAVED_SQL_TABLE_NAME))) {
        await knex.schema.createTable(SAVED_SQL_TABLE_NAME, (table) => {
            table
                .uuid('saved_sql_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .uuid('space_uuid')
                .nullable()
                .references('space_uuid')
                .inTable('spaces')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('dashboard_uuid')
                .nullable()
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table.text('name').notNullable();
            table.text('description').nullable();
            table
                .string('last_version_chart_kind')
                .defaultTo(ChartKind.VERTICAL_BAR);
            table
                .timestamp('last_version_updated_at', { useTz: false })
                .defaultTo(knex.fn.now());
            table
                .uuid('last_version_updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            table.text('slug').nullable().index();
            table.integer('views_count').defaultTo(0).notNullable();
            table.timestamp('first_viewed_at').nullable();

            table.unique(['project_uuid', 'slug']);
        });

        await knex.schema.createTable(
            SAVED_SQL_VERSIONS_TABLE_NAME,
            (table) => {
                table
                    .uuid('saved_sql_version_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('saved_sql_uuid')
                    .notNullable()
                    .references('saved_sql_uuid')
                    .inTable(SAVED_SQL_TABLE_NAME)
                    .onDelete('CASCADE')
                    .index();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.text('sql').notNullable();
                table.jsonb('config').defaultTo({});
                table.string('chart_kind').defaultTo(ChartKind.VERTICAL_BAR);
                table
                    .uuid('created_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
            },
        );
        // add search_vector column to
        await knex.raw(`
            ALTER TABLE ${SAVED_SQL_TABLE_NAME} ADD COLUMN search_vector tsvector
                GENERATED ALWAYS AS (
                setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
                setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
            ) STORED;
        `);

        // create index on saved_sql search_vector column
        await knex.schema.alterTable(SAVED_SQL_TABLE_NAME, (table) => {
            table.index('search_vector', 'saved_sql_vector_idx', 'GIN');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SAVED_SQL_TABLE_NAME);
    await knex.schema.dropTableIfExists(SAVED_SQL_VERSIONS_TABLE_NAME);
}
