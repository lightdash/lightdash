import { Knex } from 'knex';

// Untyped on purpose: migrations do not depend on the app's table types
const COMPOSER_CHARTS: string = 'composer_charts';

export const classification = {
    kind: 'safe',
    reason: "Renames the slug of any composer chart whose slug is another composer chart's uuid, so page links by slug cannot open the other chart. Older releases read slugs as plain text.",
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    const { rows } = await knex.raw<{
        rows: {
            composer_chart_uuid: string;
            project_uuid: string;
            slug: string;
        }[];
    }>(`
        SELECT charts.composer_chart_uuid, charts.project_uuid, charts.slug
        FROM composer_charts AS charts
        WHERE EXISTS (
            SELECT 1
            FROM composer_charts AS other
            WHERE other.project_uuid = charts.project_uuid
              AND other.composer_chart_uuid::text = lower(charts.slug)
              AND other.composer_chart_uuid <> charts.composer_chart_uuid
        )
    `);
    for (const chart of rows) {
        // The chart's own uuid as suffix, then a counter while that slug is taken
        const base = `${chart.slug}-${chart.composer_chart_uuid}`;
        let candidate = base;
        for (let n = 2; ; n += 1) {
            // eslint-disable-next-line no-await-in-loop
            const taken = await knex(COMPOSER_CHARTS)
                .where({ project_uuid: chart.project_uuid, slug: candidate })
                .first('composer_chart_uuid');
            if (!taken) break;
            candidate = `${base}-${n}`;
        }
        // eslint-disable-next-line no-await-in-loop
        await knex(COMPOSER_CHARTS)
            .where('composer_chart_uuid', chart.composer_chart_uuid)
            .update({ slug: candidate });
    }
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: the previous slugs of renamed composer charts are not kept',
    );
}
