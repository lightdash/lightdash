import { Knex } from 'knex';
import { PasswordLoginTableName } from '../entities/passwordLogins';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PasswordLoginTableName, (table) => {
        table.integer('failed_attempt_count').notNullable().defaultTo(0);
        table
            .timestamp('last_attempt_at')
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('blocked_until').nullable().defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PasswordLoginTableName, (table) => {
        table.dropColumns(
            'failed_attempt_count',
            'last_attempt_at',
            'blocked_until',
        );
    });
}
