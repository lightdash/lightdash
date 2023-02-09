import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';
const SchedulerSlackTargetTableName = 'scheduler_slack_target';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SchedulerTableName))) {
        await knex.schema.createTable(SchedulerTableName, (table) => {
            table
                .uuid('scheduler_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table.string('name').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE');
            table.string('cron').notNullable();
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
            table.check(
                '(saved_chart_uuid is null and dashboard_uuid is not null) OR (dashboard_uuid is null and saved_chart_uuid is not null)',
            );
        });
    }

    if (!(await knex.schema.hasTable(SchedulerSlackTargetTableName))) {
        await knex.schema.createTable(
            SchedulerSlackTargetTableName,
            (table) => {
                table
                    .uuid('scheduler_slack_target_uuid')
                    .primary()
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('updated_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .uuid('scheduler_uuid')
                    .notNullable()
                    .references('scheduler_uuid')
                    .inTable(SchedulerTableName)
                    .onDelete('CASCADE');
                table.string('channel').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SchedulerSlackTargetTableName);
    await knex.schema.dropTableIfExists(SchedulerTableName);
}
