import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const sanitizeSlug = (slug: string) =>
        `REGEXP_REPLACE(
            LOWER(
                ${slug}
            ),
            '[^a-z0-9]+', '-', 'g'
        )`;
    await knex.raw(`
        UPDATE saved_queries sq
        SET slug = ${sanitizeSlug(`sq."name"`)} 
    `);

    await knex.raw(`
        UPDATE dashboards d
        SET slug =  ${sanitizeSlug(`d."name"`)} 
    `);
    await knex.raw(`
        UPDATE spaces s
        SET slug = ${sanitizeSlug(`s."name" `)}
    `);

    // Make slugs notNullable
    await knex.schema.alterTable('saved_queries', (table) => {
        table.text('slug').notNullable().alter();
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.text('slug').notNullable().alter();
    });
    await knex.schema.alterTable('spaces', (table) => {
        table.text('slug').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Make slugs nullable
    await knex.schema.alterTable('saved_queries', (table) => {
        table.text('slug').nullable().alter();
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.text('slug').nullable().alter();
    });
    await knex.schema.alterTable('spaces', (table) => {
        table.text('slug').nullable().alter();
    });

    await knex.raw(`UPDATE saved_queries
    SET slug = NULL;`);
    await knex.raw(`UPDATE dashboards
    SET slug = NULL;`);
    await knex.raw(`UPDATE spaces
    SET slug = NULL;`);
}
