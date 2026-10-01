import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two new tables for project setup state without touching existing rows',
} as const;

const PROJECT_SETUPS_TABLE = 'project_setups';
const PROJECT_SETUP_STEPS_TABLE = 'project_setup_steps';
const LOCK_TIMEOUT = '5s';

const STEP_NAMES = ['warehouse_connection', 'semantic_layer'];
const STEP_STATUSES = [
    'not_started',
    'running',
    'failed',
    'partial',
    'succeeded',
    'skipped',
];

const toSqlList = (values: string[]) =>
    values.map((value) => `'${value}'`).join(', ');

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.createTable(PROJECT_SETUPS_TABLE, (table) => {
        table.uuid('project_setup_uuid').primary();
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
            .unique()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.integer('configuration_revision').notNullable().defaultTo(1);
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(PROJECT_SETUP_STEPS_TABLE, (table) => {
        table
            .uuid('project_setup_uuid')
            .notNullable()
            .references('project_setup_uuid')
            .inTable(PROJECT_SETUPS_TABLE)
            .onDelete('CASCADE');
        table.text('step').notNullable();
        table.text('status').notNullable();
        table.integer('configuration_revision').notNullable();
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.primary(['project_setup_uuid', 'step']);
    });

    await knex.raw(
        `ALTER TABLE ${PROJECT_SETUP_STEPS_TABLE} ADD CONSTRAINT project_setup_steps_step_check CHECK (step IN (${toSqlList(
            STEP_NAMES,
        )}))`,
    );
    await knex.raw(
        `ALTER TABLE ${PROJECT_SETUP_STEPS_TABLE} ADD CONSTRAINT project_setup_steps_status_check CHECK (status IN (${toSqlList(
            STEP_STATUSES,
        )}))`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTable(PROJECT_SETUP_STEPS_TABLE);
    await knex.schema.dropTable(PROJECT_SETUPS_TABLE);
}
