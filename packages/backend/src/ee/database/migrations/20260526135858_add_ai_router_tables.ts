import { Knex } from 'knex';

const AiRouterTableName = 'ai_router';
const AiRouterDecisionTableName = 'ai_router_decision';
const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiRouterTableName, (table) => {
        table
            .uuid('ai_router_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .unique()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table
            .specificType('project_uuids', 'uuid[]')
            .notNullable()
            .defaultTo(knex.raw("'{}'::uuid[]"));
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(AiRouterDecisionTableName, (table) => {
        table
            .uuid('ai_router_decision_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_router_uuid')
            .notNullable()
            .references('ai_router_uuid')
            .inTable(AiRouterTableName)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('prompt').notNullable();
        table
            .uuid('suggested_agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('chosen_agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL')
            .index();
        table.text('confidence').notNullable();
        table.text('reasoning').notNullable();
        table
            .specificType('candidate_agent_uuids', 'uuid[]')
            .notNullable()
            .defaultTo(knex.raw("'{}'::uuid[]"));
        table.text('selection_mode').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('committed_at', { useTz: true }).nullable();
    });

    await knex.raw(
        `INSERT INTO ${AiRouterTableName} (organization_uuid, enabled, project_uuids)
         SELECT
           o.organization_uuid,
           false,
           COALESCE(
             (SELECT array_agg(elem::uuid) FROM unnest(s.ai_multi_agent_project_uuids) AS elem),
             '{}'::uuid[]
           )
         FROM ${SlackAuthTokensTableName} s
         JOIN organizations o ON o.organization_id = s.organization_id
         WHERE s.ai_multi_agent_channel_id IS NOT NULL`,
    );

    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.dropColumn('ai_multi_agent_project_uuids');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.specificType('ai_multi_agent_project_uuids', 'text[]').nullable();
    });

    await knex.raw(
        `UPDATE ${SlackAuthTokensTableName} s
         SET ai_multi_agent_project_uuids = (
           SELECT array_agg(elem::text)
           FROM unnest(r.project_uuids) AS elem
         )
         FROM ${AiRouterTableName} r
         JOIN organizations o ON o.organization_uuid = r.organization_uuid
         WHERE s.organization_id = o.organization_id
           AND array_length(r.project_uuids, 1) > 0`,
    );

    await knex.schema.dropTableIfExists(AiRouterDecisionTableName);
    await knex.schema.dropTableIfExists(AiRouterTableName);
}
