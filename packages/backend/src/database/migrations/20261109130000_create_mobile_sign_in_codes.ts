import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table for mobile sign-in codes. Existing tables keep their columns and constraints, and the previous release never reads or writes the new table.',
};

const MobileSignInCodesTableName = 'mobile_sign_in_codes';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(MobileSignInCodesTableName, (table) => {
        table
            .uuid('mobile_sign_in_code_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('code_hash').notNullable().unique();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table.text('session_id_hash').notNullable().unique();
        table.text('approval_nonce_hash').notNullable();
        table
            .text('status')
            .notNullable()
            .defaultTo('pending')
            .checkIn([
                'pending',
                'claimed',
                'approved',
                'declined',
                'redeemed',
            ]);
        table
            .string('client_id', 255)
            .nullable()
            .references('client_id')
            .inTable('oauth2_clients')
            .onDelete('CASCADE')
            .index();
        table.text('code_challenge').nullable();
        table.text('reported_platform').nullable();
        table.smallint('match_number').nullable();
        table.smallint('failed_redeems').notNullable().defaultTo(0);
        table.timestamp('last_redeem_attempt_at', { useTz: true }).nullable();
        table.timestamp('expires_at', { useTz: true }).notNullable().index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('claimed_at', { useTz: true }).nullable();
        table.timestamp('decided_at', { useTz: true }).nullable();
        table.timestamp('redeemed_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(MobileSignInCodesTableName);
}
