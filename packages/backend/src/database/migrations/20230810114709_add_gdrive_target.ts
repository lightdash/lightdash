import { Knex } from 'knex';

const SchedulerTableName = 'scheduler';

const SchedulerGdriveTargetTableName = 'scheduler_gdrive_target';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(SchedulerGdriveTargetTableName))) {
        await knex.schema.createTable(
            SchedulerGdriveTargetTableName,
            (table) => {
                table
                    .uuid('scheduler_gdrive_target_uuid')
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
                table.string('gdrive_id').notNullable();
                table.string('gdrive_name').notNullable();
                table.string('url').notNullable();
                table.string('gdrive_organization_name').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SchedulerGdriveTargetTableName);
}
