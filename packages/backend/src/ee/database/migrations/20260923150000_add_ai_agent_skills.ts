import { Knex } from 'knex';

const SkillTableName = 'ai_agent_skill';
const SkillVersionTableName = 'ai_agent_skill_version';
const SkillAccessTableName = 'ai_agent_skill_access';
const AiAgentTableName = 'ai_agent';
const OrganizationsTableName = 'organizations';
const ProjectsTableName = 'projects';
const UsersTableName = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(SkillTableName))) {
            await knex.schema.createTable(SkillTableName, (table) => {
                table
                    .uuid('ai_agent_skill_uuid')
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
                    .uuid('project_uuid')
                    .references('project_uuid')
                    .inTable(ProjectsTableName)
                    .onDelete('SET NULL')
                    .index()
                    .comment(
                        'Optional project filter. Null means the skill is available across the organization.',
                    );
                table
                    .string('name', 64)
                    .notNullable()
                    .comment(
                        'The slug: immutable, matches the frontmatter name, the as-code folder and the /name command.',
                    );
                table.text('title');
                table.text('description').notNullable();
                table
                    .uuid('current_version_uuid')
                    .index()
                    .comment('The version served to agents.');
                table
                    .timestamp('deleted_at', { useTz: false })
                    .comment(
                        'Soft delete. The name stays reserved and versions stay resolvable.',
                    );
                table
                    .uuid('deleted_by_user_uuid')
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('SET NULL')
                    .index();
                table
                    .uuid('created_by_user_uuid')
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('SET NULL')
                    .index();
                table
                    .uuid('updated_by_user_uuid')
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('SET NULL')
                    .index();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .timestamp('updated_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.unique(['organization_uuid', 'name']);
                table.index(
                    ['organization_uuid'],
                    'ai_agent_skill_live_organization_uuid_index',
                    { predicate: knex.whereNull('deleted_at') },
                );
            });
        }

        if (!(await knex.schema.hasTable(SkillVersionTableName))) {
            await knex.schema.createTable(SkillVersionTableName, (table) => {
                table
                    .uuid('ai_agent_skill_version_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('ai_agent_skill_uuid')
                    .notNullable()
                    .references('ai_agent_skill_uuid')
                    .inTable(SkillTableName)
                    .onDelete('CASCADE')
                    .index();
                table.integer('version_number').notNullable();
                table
                    .jsonb('content')
                    .notNullable()
                    .comment(
                        'Every file of the skill as authored, keyed by path. Exactly the hashed payload.',
                    );
                table
                    .string('content_hash', 71)
                    .notNullable()
                    .comment('`sha256:` followed by 64 hex characters.');
                table.string('source', 16).notNullable();
                table.integer('restored_from_version');
                table
                    .uuid('created_by_user_uuid')
                    .references('user_uuid')
                    .inTable(UsersTableName)
                    .onDelete('SET NULL')
                    .index();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.unique(['ai_agent_skill_uuid', 'version_number']);
            });
            await knex.raw(
                `ALTER TABLE ?? ADD CONSTRAINT ai_agent_skill_version_source_check
                 CHECK (source IN ('ui', 'as_code', 'restore', 'system'))`,
                [SkillVersionTableName],
            );
            await knex.raw(
                `ALTER TABLE ?? ADD CONSTRAINT ai_agent_skill_current_version_uuid_foreign
                 FOREIGN KEY (current_version_uuid) REFERENCES ?? (ai_agent_skill_version_uuid) ON DELETE SET NULL`,
                [SkillTableName, SkillVersionTableName],
            );
        }

        if (!(await knex.schema.hasTable(SkillAccessTableName))) {
            await knex.schema.createTable(SkillAccessTableName, (table) => {
                table
                    .uuid('ai_agent_skill_uuid')
                    .notNullable()
                    .references('ai_agent_skill_uuid')
                    .inTable(SkillTableName)
                    .onDelete('CASCADE')
                    .index();
                table
                    .uuid('ai_agent_uuid')
                    .notNullable()
                    .references('ai_agent_uuid')
                    .inTable(AiAgentTableName)
                    .onDelete('CASCADE')
                    .index();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.primary(['ai_agent_skill_uuid', 'ai_agent_uuid']);
            });
        }
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(SkillAccessTableName);
        if (await knex.schema.hasTable(SkillTableName)) {
            await knex.raw(
                `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ai_agent_skill_current_version_uuid_foreign`,
                [SkillTableName],
            );
        }
        await knex.schema.dropTableIfExists(SkillVersionTableName);
        await knex.schema.dropTableIfExists(SkillTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
