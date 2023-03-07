import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('email_one_time_passcodes'))) {
        await knex.schema.createTable('email_one_time_passcodes', (table) => {
            table
                .integer('email_id')
                .primary()
                .references('email_id')
                .inTable('emails');
            table.string('passcode').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.integer('number_of_attempts').notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('email_one_time_passcodes');
}
