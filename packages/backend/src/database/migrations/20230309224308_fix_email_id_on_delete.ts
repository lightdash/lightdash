import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('email_one_time_passcodes', (tableBuilder) => {
        tableBuilder.dropForeign('email_id');
        tableBuilder
            .foreign('email_id')
            .references('email_id')
            .inTable('emails')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    // no down migration, keep cascade delete
}
