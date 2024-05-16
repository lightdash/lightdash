import { DBFieldTypes } from '@lightdash/common';
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const customBinDimensions = await knex(
        'saved_queries_version_custom_dimensions',
    ).select('saved_queries_version_id', 'id');
    const customSqlDimensions = await knex(
        'saved_queries_version_custom_sql_dimensions',
    ).select('saved_queries_version_id', 'id');

    const insertPromises = [...customBinDimensions, ...customSqlDimensions].map(
        (customDimension) =>
            knex('saved_queries_version_fields').insert({
                saved_queries_version_id:
                    customDimension.saved_queries_version_id,
                name: customDimension.id,
                field_type: DBFieldTypes.DIMENSION,
                order: 99,
            }),
    );
    console.debug(
        `Selecting ${insertPromises.length} custom dimensions in saved charts`,
    );
    await Promise.all(insertPromises);
}

export async function down(knex: Knex): Promise<void> {
    const customBinDimensions = await knex(
        'saved_queries_version_custom_dimensions',
    ).select('saved_queries_version_id', 'id');
    const customSqlDimensions = await knex(
        'saved_queries_version_custom_sql_dimensions',
    ).select('saved_queries_version_id', 'id');

    const deletePromises = [...customBinDimensions, ...customSqlDimensions].map(
        (customDimension) =>
            knex('saved_queries_version_fields')
                .delete()
                .where('name', customDimension.id)
                .andWhere(
                    'saved_queries_version_id',
                    customDimension.saved_queries_version_id,
                ),
    );
    console.debug(
        `Deselecting ${deletePromises.length} custom dimensions in saved charts`,
    );

    await Promise.all(deletePromises);
}
