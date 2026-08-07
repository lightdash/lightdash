import { type Knex } from 'knex';

const AiThreadTableName = 'ai_thread';
const AiArtifactVersionsTableName = 'ai_artifact_versions';
const AiThreadMessageSequenceTableName = 'ai_thread_message_sequence';
const AiThreadMessageTableName = 'ai_thread_message';
const AiMessagePartTableName = 'ai_message_part';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.smallint('storage_version').notNullable().defaultTo(1);
        table
            .uuid('parent_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(AiThreadTableName)
            .onDelete('CASCADE')
            .index();
        table.text('lineage_kind').nullable();
        // foreign key added once ai_thread_message exists
        table.uuid('parent_message_uuid').nullable().index();
        table.text('parent_tool_call_id').nullable();
        table.integer('fork_boundary_seq').nullable();
    });
    await knex.raw(`
        ALTER TABLE ${AiThreadTableName}
        ADD CONSTRAINT ai_thread_lineage_shape_check CHECK (
            (lineage_kind IS NULL
                AND parent_thread_uuid IS NULL
                AND parent_message_uuid IS NULL
                AND parent_tool_call_id IS NULL
                AND fork_boundary_seq IS NULL)
            OR (lineage_kind = 'spawn'
                AND parent_thread_uuid IS NOT NULL
                AND parent_message_uuid IS NOT NULL
                AND parent_tool_call_id IS NOT NULL
                AND fork_boundary_seq IS NULL)
            OR (lineage_kind = 'fork'
                AND parent_thread_uuid IS NOT NULL
                AND parent_message_uuid IS NULL
                AND parent_tool_call_id IS NULL
                AND fork_boundary_seq IS NOT NULL)
        )
    `);

    await knex.schema.createTable(AiThreadMessageSequenceTableName, (table) => {
        table
            .uuid('ai_thread_uuid')
            .primary()
            .references('ai_thread_uuid')
            .inTable(AiThreadTableName)
            .onDelete('CASCADE');
        table.integer('next_thread_seq').notNullable().defaultTo(1);
    });

    await knex.schema.createTable(AiThreadMessageTableName, (table) => {
        table
            .uuid('ai_thread_message_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable(AiThreadTableName)
            .onDelete('CASCADE');
        table.integer('thread_seq').notNullable();
        table.text('role').notNullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.text('status').nullable();
        table.timestamp('last_heartbeat_at', { useTz: false }).nullable();
        table.jsonb('model_config').nullable();
        table.jsonb('token_usage').nullable();
        table.jsonb('error').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        // also indexes the ai_thread_uuid foreign key
        table.unique(['ai_thread_uuid', 'thread_seq']);
    });
    await knex.raw(`
        ALTER TABLE ${AiThreadMessageTableName}
        ADD CONSTRAINT ai_thread_message_role_status_check
            CHECK ((role = 'assistant') = (status IS NOT NULL))
    `);

    await knex.schema.createTable(AiMessagePartTableName, (table) => {
        table
            .uuid('ai_message_part_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_thread_message_uuid')
            .notNullable()
            .references('ai_thread_message_uuid')
            .inTable(AiThreadMessageTableName)
            .onDelete('CASCADE');
        table.integer('part_index').notNullable();
        table.text('type').notNullable();
        table.integer('payload_version').notNullable();
        table.jsonb('payload').notNullable();
        table.text('tool_call_id').nullable();
        table
            .uuid('ai_artifact_version_uuid')
            .nullable()
            .references('ai_artifact_version_uuid')
            .inTable(AiArtifactVersionsTableName)
            .onDelete('CASCADE')
            .index();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        // also indexes the ai_thread_message_uuid foreign key
        table.unique(['ai_thread_message_uuid', 'part_index']);
        table.unique(['ai_thread_message_uuid', 'tool_call_id']);
    });
    await knex.raw(`
        ALTER TABLE ${AiMessagePartTableName}
        ADD CONSTRAINT ai_message_part_tool_call_shape_check
            CHECK (tool_call_id IS NULL OR type = 'tool'),
        ADD CONSTRAINT ai_message_part_artifact_version_shape_check
            CHECK (ai_artifact_version_uuid IS NULL OR type = 'artifact')
    `);

    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table
            .foreign('parent_message_uuid')
            .references('ai_thread_message_uuid')
            .inTable(AiThreadMessageTableName)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    // dropping the columns also drops their checks, indexes and foreign keys
    await knex.schema.alterTable(AiThreadTableName, (table) => {
        table.dropColumns(
            'storage_version',
            'parent_thread_uuid',
            'lineage_kind',
            'parent_message_uuid',
            'parent_tool_call_id',
            'fork_boundary_seq',
        );
    });
    await knex.schema.dropTableIfExists(AiMessagePartTableName);
    await knex.schema.dropTableIfExists(AiThreadMessageTableName);
    await knex.schema.dropTableIfExists(AiThreadMessageSequenceTableName);
}
