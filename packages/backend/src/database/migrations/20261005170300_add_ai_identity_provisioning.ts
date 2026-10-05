import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Adds optional AI identity provisioning settings and tables without changing existing identity data.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_accounts', (table) => {
        table.text('creation_mode').notNullable().defaultTo('guided');
    });
    await knex.raw(
        'ALTER TABLE ai_identity_jobs DROP CONSTRAINT ai_identity_jobs_kind_check',
    );
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_kind_check CHECK (kind IN ('test', 'export', 'sync', 'provision'))",
    );
    await knex.raw(
        "ALTER TABLE ai_identity_accounts ADD CONSTRAINT ai_identity_accounts_creation_mode_check CHECK (creation_mode IN ('guided', 'automatic'))",
    );
    await knex.schema.createTable('ai_identity_provisioners', (table) => {
        table
            .uuid('ai_identity_account_uuid')
            .primary()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE');
        table.text('user_name').notNullable();
        table.text('role_name').notNullable();
        table.text('public_key').notNullable();
        table.text('public_key_fingerprint').notNullable();
        table.binary('encrypted_private_key').notNullable();
        table.text('status').notNullable().defaultTo('waiting_for_setup');
        table.text('status_message').nullable();
        table.timestamp('checked_at', { useTz: true }).nullable();
        table.timestamp('first_run_approved_at', { useTz: true }).nullable();
        table
            .uuid('first_run_approved_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.jsonb('findings').notNullable().defaultTo('[]');
        table.timestamps(true, true);
    });
    await knex.raw(
        "ALTER TABLE ai_identity_provisioners ADD CONSTRAINT ai_identity_provisioners_status_check CHECK (status IN ('waiting_for_setup', 'ready', 'failing', 'revoked'))",
    );
    await knex.schema.createTable('ai_identity_ai_roles', (table) => {
        table
            .uuid('ai_identity_ai_role_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_identity_account_uuid')
            .notNullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE')
            .index();
        table.text('role_name').notNullable();
        table.text('warehouse').notNullable();
        table.jsonb('schemas').notNullable().defaultTo('[]');
        table.timestamps(true, true);
        table.unique(['ai_identity_account_uuid', 'role_name']);
    });
    await knex.schema.createTable('ai_identity_role_mappings', (table) => {
        table
            .uuid('ai_identity_role_mapping_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_identity_account_uuid')
            .notNullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('group_uuid')
            .notNullable()
            .references('group_uuid')
            .inTable('groups')
            .onDelete('CASCADE')
            .index();
        table.text('ai_role').notNullable();
        table.integer('priority').notNullable();
        table.unique(['ai_identity_account_uuid', 'group_uuid']);
    });
    await knex.schema.alterTable('ai_identities', (table) => {
        table.boolean('created_by_provisioner').notNullable().defaultTo(false);
        table.text('provisioned_role').nullable();
        table.text('provisioned_public_key_fingerprint').nullable();
        table.text('provisioned_user_name').nullable();
    });
    await knex.schema.createTable('ai_identity_provisioning_drops', (table) => {
        table
            .uuid('ai_identity_provisioning_drop_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_identity_account_uuid')
            .notNullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE')
            .index();
        table.text('user_name').notNullable();
        table.timestamps(true, true);
        table.unique(['ai_identity_account_uuid', 'user_name']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_identity_provisioning_drops');
    await knex('ai_identity_jobs').where('kind', 'provision').delete();
    await knex.raw(
        'ALTER TABLE ai_identity_jobs DROP CONSTRAINT ai_identity_jobs_kind_check',
    );
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_kind_check CHECK (kind IN ('test', 'export', 'sync'))",
    );
    await knex.schema.alterTable('ai_identities', (table) => {
        table.dropColumn('provisioned_user_name');
        table.dropColumn('provisioned_public_key_fingerprint');
        table.dropColumn('provisioned_role');
        table.dropColumn('created_by_provisioner');
    });
    await knex.schema.dropTable('ai_identity_role_mappings');
    await knex.schema.dropTable('ai_identity_ai_roles');
    await knex.schema.dropTable('ai_identity_provisioners');
    await knex.schema.alterTable('ai_identity_accounts', (table) => {
        table.dropColumn('creation_mode');
    });
}
