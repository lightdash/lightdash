import { Knex } from 'knex';

const HomepageRecommendedActionSkipsTableName =
    'homepage_recommended_action_skips';
const ProjectContextUniqueIndexName =
    'homepage_recommended_action_skips_project_unique_idx';
const NoProjectContextUniqueIndexName =
    'homepage_recommended_action_skips_no_project_unique_idx';
const SKIPPABLE_ACTION_KEYS = [
    'add-semantic-layer',
    'connect-source-control',
    'connect-slack',
];

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        HomepageRecommendedActionSkipsTableName,
        (table) => {
            table
                .uuid('homepage_recommended_action_skip_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .nullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table
                .text('action_key')
                .notNullable()
                .checkIn(SKIPPABLE_ACTION_KEYS);
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );

    await knex.raw(
        'CREATE UNIQUE INDEX ?? ON ?? (??, ??, ??) WHERE ?? IS NOT NULL',
        [
            ProjectContextUniqueIndexName,
            HomepageRecommendedActionSkipsTableName,
            'organization_uuid',
            'project_uuid',
            'action_key',
            'project_uuid',
        ],
    );
    await knex.raw('CREATE UNIQUE INDEX ?? ON ?? (??, ??) WHERE ?? IS NULL', [
        NoProjectContextUniqueIndexName,
        HomepageRecommendedActionSkipsTableName,
        'organization_uuid',
        'action_key',
        'project_uuid',
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(HomepageRecommendedActionSkipsTableName);
}
