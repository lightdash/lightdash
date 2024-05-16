import { DBFieldTypes } from '@lightdash/common';
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    const customBinDimensions = await knex(
        'saved_queries_version_custom_dimensions',
    ).select('saved_queries_version_id', 'id', 'order');
    const customSqlDimensions = await knex(
        'saved_queries_version_custom_sql_dimensions',
    ).select('saved_queries_version_id', 'id', 'order');

    const newEntries = [...customBinDimensions, ...customSqlDimensions].map(
        (customDimension) => ({
            saved_queries_version_id: customDimension.saved_queries_version_id,
            name: customDimension.id,
            field_type: DBFieldTypes.DIMENSION,
            order: customDimension.order,
        }),
    );
    console.debug(
        `Selecting ${newEntries.length} custom dimensions in saved charts`,
    );
    await knex('saved_queries_version_fields').insert(newEntries);
}

export async function down(knex: Knex): Promise<void> {
    const customBinDimensions = await knex(
        'saved_queries_version_custom_dimensions',
    ).select('saved_queries_version_id', 'id');
    const customSqlDimensions = await knex(
        'saved_queries_version_custom_sql_dimensions',
    ).select('saved_queries_version_id', 'id');

    await knex('saved_queries_version_fields')
        .delete()
        .where((builder) => {
            [...customBinDimensions, ...customSqlDimensions].forEach(
                (customDimension) =>
                    builder.orWhere((nestedBuilder) =>
                        nestedBuilder
                            .where('name', customDimension.id)
                            .andWhere('field_type', DBFieldTypes.DIMENSION)
                            .andWhere(
                                'saved_queries_version_id',
                                customDimension.saved_queries_version_id,
                            ),
                    ),
            );
        });
}
