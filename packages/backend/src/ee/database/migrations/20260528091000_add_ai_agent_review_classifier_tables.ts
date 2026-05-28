import { Knex } from 'knex';

const runTable = 'ai_agent_review_run';
const turnSignalTable = 'ai_agent_review_turn_signal';

const organizationsTable = 'organizations';
const projectsTable = 'projects';
const aiAgentTable = 'ai_agent';
const aiThreadTable = 'ai_thread';
const aiPromptTable = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(runTable, (table) => {
        table
            .uuid('ai_agent_review_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(organizationsTable)
            .onDelete('CASCADE');
        table
            .enum('status', ['queued', 'running', 'completed', 'failed'])
            .notNullable()
            .defaultTo('queued');
        table.text('review_agent_version').notNullable();
        table.text('judge_prompt_hash').notNullable();
        table.text('agent_config_snapshot_hash');
        table.jsonb('agent_config_snapshot');
        table.timestamp('agent_config_snapshot_agent_updated_at', {
            useTz: false,
        });
        table.jsonb('run_scope').notNullable();
        table.integer('total_turns').notNullable().defaultTo(0);
        table.integer('processed_turns').notNullable().defaultTo(0);
        table.integer('signal_count').notNullable().defaultTo(0);
        table.integer('finding_count').notNullable().defaultTo(0);
        table.integer('review_item_count').notNullable().defaultTo(0);
        table.text('error_message');
        table.timestamp('completed_at', { useTz: false });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'created_at']);
        table.index(['status']);
    });

    await knex.schema.createTable(turnSignalTable, (table) => {
        table
            .uuid('ai_agent_review_turn_signal_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_agent_review_run_uuid')
            .notNullable()
            .references('ai_agent_review_run_uuid')
            .inTable(runTable)
            .onDelete('CASCADE');
        table
            .uuid('ai_prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable(aiPromptTable)
            .onDelete('CASCADE');
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(organizationsTable)
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('CASCADE');
        table
            .uuid('agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable(aiAgentTable)
            .onDelete('CASCADE');
        table.enum('interaction_source', ['app', 'slack']).notNullable();
        table.jsonb('source_ref').notNullable();
        table
            .enum('signal', [
                'normal_refinement',
                'implicit_correction',
                'explicit_dispute',
                'retry_after_failure',
                'output_shape_correction',
                'new_question',
                'acceptance_or_continuation',
                'product_capability_request',
                'human_intervention',
                'ambiguous',
            ])
            .notNullable();
        table.jsonb('implicit_signal_sources').notNullable();
        table.enum('confidence', ['low', 'medium', 'high']).notNullable();
        table.boolean('promoted_to_finding').notNullable().defaultTo(false);
        table.text('promotion_reason');
        table.jsonb('tool_evidence_refs').notNullable();
        table.text('fingerprint');
        table.enum('primary_root_cause', [
            'semantic_layer',
            'project_context',
            'agent_configuration',
            'data_gap',
            'product_capability',
            'runtime_reliability',
            'feedback_quality',
            'not_a_failure',
            'ambiguous',
        ]);
        table.jsonb('secondary_root_causes');
        table.jsonb('subcategories');
        table.jsonb('fix_targets');
        table.jsonb('target_refs');
        table.jsonb('evidence_excerpts');
        table.jsonb('recommendation');
        table.enum('owner_type', [
            'semantic_layer_owner',
            'agent_admin',
            'product',
            'support',
            'unknown',
        ]);
        table.text('review_item_title');
        table.text('review_item_description');
        table.jsonb('runtime_context_snapshot').notNullable();
        table.jsonb('model_metadata').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['ai_agent_review_run_uuid']);
        table.index(['ai_prompt_uuid']);
        table.index(['organization_uuid', 'created_at']);
        table.index(['project_uuid']);
        table.index(['agent_uuid']);
        table.index(['signal']);
        table.index(['fingerprint']);
        table.index(['primary_root_cause']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(turnSignalTable);
    await knex.schema.dropTableIfExists(runTable);
}
