import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const sanitizeSlug = (slug: string) =>
        `REGEXP_REPLACE(
            LOWER(
                ${slug}
            ),
            '[^a-z0-9]+', '-', 'g'
        )`;
    // Charts in spaces
    await knex.raw(`
        UPDATE saved_queries sq
        SET slug = ${sanitizeSlug(`sq."name"`)} 
        FROM spaces s
        WHERE sq.space_id = s.space_id
        AND sq.space_id IS NOT NULL;
  `);
    // Charts in dashboards
    await knex.raw(`
        UPDATE saved_queries sq
        SET slug = ${sanitizeSlug(`sq."name"`)} 
        WHERE sq.dashboard_uuid IS NOT NULL;
    `);
    await knex.raw(`
    UPDATE dashboards d
    SET slug =  ${sanitizeSlug(`d."name"`)} 
       
    FROM spaces s
    WHERE d.space_id = s.space_id
    AND d.space_id IS NOT NULL;
  `);
    await knex.raw(`
  UPDATE spaces s
  SET slug = ${sanitizeSlug(`s."name" `)}
`);

    // Make slugs notNullable
    await knex.schema.alterTable('saved_queries', (table) => {
        table.string('slug').notNullable().alter();
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.string('slug').notNullable().alter();
    });
    await knex.schema.alterTable('spaces', (table) => {
        table.string('slug').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Make slugs nullable
    await knex.schema.alterTable('saved_queries', (table) => {
        table.string('slug').nullable().alter();
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.string('slug').nullable().alter();
    });
    await knex.schema.alterTable('spaces', (table) => {
        table.string('slug').nullable().alter();
    });

    await knex.raw(`UPDATE saved_queries
    SET slug = NULL;`);
    await knex.raw(`UPDATE dashboards
    SET slug = NULL;`);
    await knex.raw(`UPDATE spaces
    SET slug = NULL;`);
}
