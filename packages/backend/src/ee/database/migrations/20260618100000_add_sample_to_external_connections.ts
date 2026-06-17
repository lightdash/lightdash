import { Knex } from 'knex';

const ExternalConnectionsTableName = 'external_connections';

export async function up(knex: Knex): Promise<void> {
    const hasTestSample = await knex.schema.hasColumn(
        ExternalConnectionsTableName,
        'last_test_sample',
    );
    const hasTestedAt = await knex.schema.hasColumn(
        ExternalConnectionsTableName,
        'last_tested_at',
    );
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        if (!hasTestSample) {
            // Sanitized, truncated response body captured by the last admin
            // "Test connection". Never holds secret material — saveSample
            // strips it before persisting.
            table.jsonb('last_test_sample').nullable();
        }
        if (!hasTestedAt) {
            table.timestamp('last_tested_at', { useTz: false }).nullable();
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasTestSample = await knex.schema.hasColumn(
        ExternalConnectionsTableName,
        'last_test_sample',
    );
    const hasTestedAt = await knex.schema.hasColumn(
        ExternalConnectionsTableName,
        'last_tested_at',
    );
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        if (hasTestSample) {
            table.dropColumn('last_test_sample');
        }
        if (hasTestedAt) {
            table.dropColumn('last_tested_at');
        }
    });
}
