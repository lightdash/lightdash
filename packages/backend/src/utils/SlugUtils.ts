import { generateSlug } from '@lightdash/common';
import { Knex } from 'knex';

export const generateUniqueSlug = async (
    trx: Knex,
    tableName:
        | 'saved_semantic_viewer_charts'
        | 'saved_queries'
        | 'saved_sql'
        | 'dashboards'
        | 'spaces',
    name: string,
) => {
    const baseSlug = generateSlug(name);
    const matchingSlugs: string[] = await trx(tableName)
        .select('slug')
        .where('slug', 'like', `${baseSlug}%`)
        .pluck('slug');
    let slug = generateSlug(name);
    let inc = 0;
    while (matchingSlugs.includes(slug)) {
        inc += 1;
        slug = `${baseSlug}-${inc}`; // generate new slug with number suffix
    }
    return slug;
};
