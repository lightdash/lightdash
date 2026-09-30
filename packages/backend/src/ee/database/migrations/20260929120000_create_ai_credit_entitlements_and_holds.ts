import { Knex } from 'knex';

const EntitlementsTableName = 'ai_credit_entitlements';
const HoldsTableName = 'ai_credit_holds';
const OrganizationsTableName = 'organizations';
const UsersTableName = 'users';

// Must match AI_CREDIT_HOLD_REASONS in @lightdash/common; the real-schema test compares them.
const HOLD_REASONS = [
    'allowance_exhausted',
    'admin_cap_reached',
    'manual_pause',
    'trial_ended',
];

export const classification = {
    kind: 'safe',
    reason: 'Creates two new empty tables. Raw SQL only sets a lock timeout, generates UUID defaults and creates partial indexes on the new holds table; existing tables and data are unchanged.',
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
                // A monthly window and an annual pool may start on the same day.
                table.unique([
                    'organization_uuid',
                    'period_start',
                    'period_end',
                ]);
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
                    .comment('Null pauses the whole organization.');
                table
                    .uuid('ai_credit_entitlement_uuid')
                    .nullable()
                    .references('ai_credit_entitlement_uuid')
                    .inTable(EntitlementsTableName)
                    .onDelete('CASCADE')
                    .index()
                    .comment(
                        'The entitlement whose allowance ran out, for holds placed by the usage sink.',
                    );
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
                        'A hold placed for an exhausted allowance stops applying when its period ends.',
                    );
                table.timestamp('released_at', { useTz: true }).nullable();
                table.check(
                    `reason IN (${HOLD_REASONS.map((reason) => `'${reason}'`).join(', ')})`,
                    [],
                    'ai_credit_holds_reason_check',
                );
            });
            await knex.raw(
                `CREATE INDEX ai_credit_holds_active_organization_index ON ${HoldsTableName} (organization_uuid) WHERE released_at IS NULL`,
            );
            // Concurrent sink calls race to place the hold; this keeps one per exhausted entitlement, even after an early release.
            await knex.raw(
                `CREATE UNIQUE INDEX ai_credit_holds_allowance_exhausted_entitlement_unique ON ${HoldsTableName} (ai_credit_entitlement_uuid) WHERE reason = 'allowance_exhausted'`,
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
