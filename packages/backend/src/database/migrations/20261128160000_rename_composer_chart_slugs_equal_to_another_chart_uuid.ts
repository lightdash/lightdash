import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: "Renames the slug of any composer chart whose slug is another composer chart's uuid, so page links by slug cannot open the other chart. Older releases read slugs as plain text.",
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    // Suffixing the chart's own uuid keeps the new slug unique in its project
    await knex.raw(`
        UPDATE composer_charts AS charts
        SET slug = charts.slug || '-' || charts.composer_chart_uuid::text
        WHERE EXISTS (
            SELECT 1
            FROM composer_charts AS other
            WHERE other.composer_chart_uuid::text = charts.slug
              AND other.composer_chart_uuid <> charts.composer_chart_uuid
        )
    `);
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: the previous slugs of renamed composer charts are not kept',
    );
}
