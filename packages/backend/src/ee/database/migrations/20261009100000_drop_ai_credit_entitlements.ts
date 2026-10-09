import { Knex } from 'knex';

const EntitlementsTableName = 'ai_credit_entitlements';
const HoldsTableName = 'ai_credit_holds';
const OrganizationsTableName = 'organizations';
const EntitlementColumnName = 'ai_credit_entitlement_uuid';
const EntitlementHoldIndexName =
    'ai_credit_holds_allowance_exhausted_entitlement_unique';

export const classification = {
    kind: 'breaking',
    reason: 'Drops the empty ai_credit_entitlements table and the unused ai_credit_entitlement_uuid column on ai_credit_holds. Releases from 2.388.0 neither read nor write them; a previous release older than that still queries the table from the usage sink. Raw SQL only sets a lock timeout and, on rollback, restores the partial unique index.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        // Dropping the column also drops its foreign key, its index and the partial unique index on it.
        if (
            await knex.schema.hasColumn(HoldsTableName, EntitlementColumnName)
        ) {
            await knex.schema.alterTable(HoldsTableName, (table) => {
                table.dropColumn(EntitlementColumnName);
            });
        }
        await knex.schema.dropTableIfExists(EntitlementsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(EntitlementsTableName))) {
            await knex.schema.createTable(EntitlementsTableName, (table) => {
                table
                    .uuid(EntitlementColumnName)
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
                table.decimal('allowance_credits', 18, 6).nullable();
                table
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
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
        if (
            !(await knex.schema.hasColumn(
                HoldsTableName,
                EntitlementColumnName,
            ))
        ) {
            await knex.schema.alterTable(HoldsTableName, (table) => {
                table
                    .uuid(EntitlementColumnName)
                    .nullable()
                    .references(EntitlementColumnName)
                    .inTable(EntitlementsTableName)
                    .onDelete('CASCADE')
                    .index();
            });
            await knex.raw(
                `CREATE UNIQUE INDEX ${EntitlementHoldIndexName} ON ${HoldsTableName} (${EntitlementColumnName}) WHERE reason = 'allowance_exhausted'`,
            );
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
