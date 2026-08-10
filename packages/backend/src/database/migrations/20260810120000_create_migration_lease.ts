import { type Knex } from 'knex';
import { MIGRATION_LEASE_SCHEMA_SQL } from '../migrationLeaseSchema';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(MIGRATION_LEASE_SCHEMA_SQL);
}

export { MIGRATION_LEASE_SCHEMA_SQL };

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('migration_lease');
}
