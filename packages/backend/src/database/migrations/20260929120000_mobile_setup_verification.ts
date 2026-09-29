import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable verification fields and a constant default attempt count.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('mobile_setup_codes', (table) => {
        table.string('verification_challenge', 43).nullable();
        table.string('verification_client_id').nullable();
        table.string('verification_platform').nullable();
        table.binary('verification_code_encrypted').nullable();
        table.integer('verification_attempts').notNullable().defaultTo(0);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('mobile_setup_codes', (table) => {
        table.dropColumns(
            'verification_challenge',
            'verification_client_id',
            'verification_platform',
            'verification_code_encrypted',
            'verification_attempts',
        );
    });
}
