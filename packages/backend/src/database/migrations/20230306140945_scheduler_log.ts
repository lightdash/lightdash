import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';
const SchedulerLogTableName = 'scheduler_log';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SchedulerLogTableName))) {
        await knex.schema.createTable(SchedulerLogTableName, (table) => {
            table.string('job_id').notNullable();
            table.string('task').notNullable();
            table.string('job_group').notNullable();

            table
                .uuid('scheduler_uuid')
                .references('scheduler_uuid')
                .inTable(SchedulerTableName)
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('scheduled_time', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.string('status').notNullable();
            table.string('target').nullable();
            table.string('target_type').nullable();
            table.jsonb('details').nullable();

            table.index(['job_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SchedulerLogTableName);
}
