import { Knex } from 'knex';

const documentTable = 'project_context_document';
const projectsTable = 'projects';

// The cached project context: the whole lightdash.project_context.yml file as
// one blob per project, refreshed on compile and read wholesale by the agent.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(documentTable, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('CASCADE');
        table.integer('version').notNullable().defaultTo(1);
        table.jsonb('entries').notNullable().defaultTo('[]');
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(documentTable);
}
