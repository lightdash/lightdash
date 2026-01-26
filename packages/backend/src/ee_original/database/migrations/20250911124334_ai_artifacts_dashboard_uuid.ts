import { Knex } from 'knex';
import { DashboardsTableName } from '../../../database/entities/dashboards';

const AiArtifactVersionsTableName = 'ai_artifact_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiArtifactVersionsTableName, (table) => {
        table
            .uuid('saved_dashboard_uuid')
            .nullable()
            .references('dashboard_uuid')
            .inTable(DashboardsTableName)
            .onDelete('SET NULL');
        table.index('saved_dashboard_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiArtifactVersionsTableName, (table) => {
        table.dropColumn('saved_dashboard_uuid');
    });
}
