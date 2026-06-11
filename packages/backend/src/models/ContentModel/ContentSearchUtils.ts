import { type Knex } from 'knex';

export const compactContentSearchText = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const getContentSearchPatterns = (search: string) => ({
    lower: `%${search.toLowerCase()}%`,
    compact: compactContentSearchText(search),
});

// Remote mention suggestions use v2/content, so the fuzzy part has to be
// expressed in SQL instead of the frontend-only label matcher.
export const applyContentNameSearch = (
    builder: Knex.QueryBuilder,
    column: string,
    search: string,
) => {
    const patterns = getContentSearchPatterns(search);

    void builder.where((searchBuilder) => {
        void searchBuilder.whereRaw(`LOWER(${column}) LIKE ?`, [
            patterns.lower,
        ]);

        if (patterns.compact) {
            void searchBuilder.orWhereRaw(
                `regexp_replace(LOWER(${column}), '[^a-z0-9]+', '', 'g') LIKE ?`,
                [`%${patterns.compact}%`],
            );
        }
    });
};
