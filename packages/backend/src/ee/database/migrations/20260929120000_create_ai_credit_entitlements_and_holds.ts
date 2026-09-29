import { Knex } from 'knex';

const EntitlementsTableName = 'ai_credit_entitlements';
const HoldsTableName = 'ai_credit_holds';
const OrganizationsTableName = 'organizations';
const UsersTableName = 'users';

export const classification = {
    kind: 'safe',
    reason: 'Creates two new empty tables. Raw SQL only sets a lock timeout and generates UUID defaults; existing tables and data are unchanged.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(EntitlementsTableName))) {
            await knex.schema.createTable(EntitlementsTableName, (table) => {
                table
                    .uuid('ai_credit_entitlement_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable(OrganizationsTableName)
                    .onDelete('CASCADE');
                table.timestamp('period_start', { useTz: true }).notNullable();
                table.timestamp('period_end', { useTz: true }).notNullable();
                table
                    .decimal('allowance_credits', 18, 6)
                    .nullable()
                    .comment('Null until an allowance is agreed.');
                table
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('updated_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.unique(['organization_uuid', 'period_start']);
                table.check(
                    'period_end > period_start',
                    [],
                    'ai_credit_entitlements_period_check',
                );
            });
        }

        if (!(await knex.schema.hasTable(HoldsTableName))) {
            await knex.schema.createTable(HoldsTableName, (table) => {
                table
                    .uuid('ai_credit_hold_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable(OrganizationsTableName)
                    .onDelete('CASCADE')
                    .index();
                table
                    .uuid('user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('CASCADE')
                    .index()
                    .comment('Null pauses the whole organisation.');
                table.text('reason').notNullable();
                table
                    .text('notes')
                    .nullable()
                    .comment(
                        'Free text for operators, never shown to customers.',
                    );
                table.text('placed_by').notNullable();
                table
                    .timestamp('placed_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('expires_at', { useTz: true })
                    .nullable()
                    .comment(
                        'A hold placed for an exhausted allowance stops applying when its window ends.',
                    );
                table.timestamp('released_at', { useTz: true }).nullable();
                table.check(
                    `reason IN ('allowance_exhausted', 'admin_cap_reached', 'manual_pause', 'trial_ended')`,
                    [],
                    'ai_credit_holds_reason_check',
                );
            });
            await knex.raw(
                `CREATE INDEX ai_credit_holds_active_organization_index ON ${HoldsTableName} (organization_uuid) WHERE released_at IS NULL`,
            );
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(HoldsTableName);
        await knex.schema.dropTableIfExists(EntitlementsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
