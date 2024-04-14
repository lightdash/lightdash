import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

const tableName = 'dashboard_tabs';
const dashboardTable = 'dashboards';
const dashboardVersionTable = 'dashboard_versions';
const DashboardTilesTableName = 'dashboard_tiles';
const DashboardTileTabUuidColumnName = 'tab_uuid';

export async function up(knex: Knex): Promise<void> {
    // create dashboard tab table
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder.string('name').notNullable();
            tableBuilder.uuid('uuid').notNullable().defaultTo(uuidv4());
            tableBuilder.boolean('is_default');
            tableBuilder.integer('order');
            tableBuilder
                .integer('dashboard_id')
                .notNullable()
                .references('dashboard_id')
                .inTable(dashboardTable)
                .onDelete('CASCADE');
            tableBuilder
                .integer('dashboard_version_id')
                .notNullable()
                .references('dashboard_version_id')
                .inTable(dashboardVersionTable)
                .onDelete('CASCADE');
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.primary([
                'uuid',
                'dashboard_id',
                'dashboard_version_id',
            ]);
        });

        // add tab_uuid column which reference to the dashboard tab
        if (
            !(await knex.schema.hasColumn(
                DashboardTilesTableName,
                DashboardTileTabUuidColumnName,
            ))
        ) {
            await knex.schema.alterTable(
                DashboardTilesTableName,
                (tableBuilder) => {
                    tableBuilder
                        .uuid(DashboardTileTabUuidColumnName)
                        .nullable();
                },
            );
        }
    }
}
export async function down(knex: Knex): Promise<void> {
    // drop tab_uuid column
    if (
        await knex.schema.hasColumn(
            DashboardTilesTableName,
            DashboardTileTabUuidColumnName,
        )
    ) {
        await knex.schema.table(DashboardTilesTableName, (table) => {
            table.dropColumns(DashboardTileTabUuidColumnName);
        });
    }
    // drop dashboard_tiles table
    await knex.schema.dropTableIfExists(tableName);
}
