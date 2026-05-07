import { Knex } from 'knex';

const ServiceAccountsTableName = 'service_accounts';
const ColumnName = 'service_account_user_uuid';

// Set `service_account_user_uuid` to NOT NULL. Deferred follow-up to
// the column-add + backfill that shipped in #22661 (PROD-7427) — we
// kept the column nullable for one stability window so rolling deploys
// and code-without-migration rollbacks didn't trip on the constraint.
//
// `service_accounts` is a tiny table (typically <100 rows), so
// validating the constraint is near-instant.
//
// Wrapped in try/catch as a defensive net: if a stray NULL row slipped
// through (e.g. an old-code replica created an SA during the deploy
// window before the new INSERT path was running), the SET NOT NULL
// will fail with `column ... contains null values`. We log and
// continue rather than block the deploy chain — operators can backfill
// the offender and re-run the migration.
export async function up(knex: Knex): Promise<void> {
    try {
        await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
            table.uuid(ColumnName).notNullable().alter();
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            `Could not set NOT NULL on ${ServiceAccountsTableName}.${ColumnName}: ${
                error instanceof Error ? error.message : String(error)
            }. Backfill orphan rows and re-run.`,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ServiceAccountsTableName, (table) => {
        table.uuid(ColumnName).nullable().alter();
    });
}
