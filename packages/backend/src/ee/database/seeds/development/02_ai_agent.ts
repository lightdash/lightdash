import { SEED_ORG_1, SEED_PROJECT } from '@lightdash/common';
import { Knex } from 'knex';
import { AiAgentTableName } from '../../entities/aiAgent';

export async function seed(knex: Knex): Promise<void> {
    await knex(AiAgentTableName)
        .insert({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            name: 'Jaffle Shop Agent',
            slug: 'jaffle-shop-agent',
            description: 'Development agent with all query and content tools.',
            image_url: null,
            image_url_source: null,
            tags: null,
            version: 2,
            enable_data_access: true,
            enable_content_tools: true,
            enable_sql_mode: true,
            enable_sql_auto_approval: true,
            enable_composer_queries: true,
            enable_self_improvement: false,
            enable_user_context: false,
            admin_only: false,
            model_config: null,
            ai_organization_provider_credential_uuid: null,
            thread_retention_hours: null,
        })
        .onConflict(['project_uuid', 'slug'])
        .ignore();
}
