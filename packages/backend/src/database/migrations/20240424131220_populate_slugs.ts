import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const sanitizeSlug = (slug: string) =>
        `REGEXP_REPLACE(
            LOWER(
                ${slug}
            ),
            '[^a-z0-9]+', '-', 'g'
        )`;
    // This will populate slugs only for charts in spaces, not charts in dashboards

    await knex.raw(`
        UPDATE saved_queries sq
        SET slug = 'charts/' || ${sanitizeSlug(
            `s."name"`,
        )} || '/' || ${sanitizeSlug(`sq."name"`)} 
        FROM spaces s
        WHERE sq.space_id = s.space_id
        AND sq.space_id IS NOT NULL;
  `);
    await knex.raw(`
    UPDATE dashboards d
    SET slug =  'dashboards/' || ${sanitizeSlug(
        `s."name"`,
    )} || '/' || ${sanitizeSlug(`d."name"`)} 
       
    FROM spaces s
    WHERE d.space_id = s.space_id
    AND d.space_id IS NOT NULL;
  `);
    await knex.raw(`
  UPDATE spaces s
  SET slug = 'spaces/' || ${sanitizeSlug(`s."name" `)}
`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`UPDATE saved_queries
    SET slug = NULL;`);
    await knex.raw(`UPDATE dashboards
    SET slug = NULL;`);
    await knex.raw(`UPDATE spaces
    SET slug = NULL;`);
}
