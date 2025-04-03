import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';
const SchedulerMsTeamsTargetTableName = 'scheduler_msteams_target';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SchedulerMsTeamsTargetTableName))) {
        await knex.schema.createTable(
            SchedulerMsTeamsTargetTableName,
            (table) => {
                table
                    .uuid('scheduler_msteams_target_uuid')
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
                table.text('webhook').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SchedulerMsTeamsTargetTableName);
}
