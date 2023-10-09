import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('openid_issuers'))) {
        await knex.schema.createTable('openid_issuers', (tableBuilder) => {
            tableBuilder.text('issuer').primary();
        });
        await knex('openid_issuers').insert({
            issuer: 'https://accounts.google.com',
        });
    }
    if (!(await knex.schema.hasTable('openid_identities'))) {
        await knex.schema.createTable('openid_identities', (tableBuilder) => {
            tableBuilder
                .text('issuer')
                .notNullable()
                .references('issuer')
                .inTable('openid_issuers');
            tableBuilder.text('subject').notNullable();
            tableBuilder.primary(['issuer', 'subject']);
            tableBuilder
                .integer('user_id')
                .notNullable()
                .references('user_id')
                .inTable('users')
                .onDelete('CASCADE');
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.string('email').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('openid_identities');
    await knex.schema.dropTableIfExists('openid_issuers');
}
