import { Knex } from 'knex';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getGroupedFields = async (knex: Knex): Promise<Record<string, any>> => {
    const results = await knex('saved_queries_version_fields').orderBy([
        { column: 'saved_queries_version_id' },
        { column: 'field_type', order: 'asc' },
        { column: 'order', order: 'asc' },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return results.reduce<Record<string, any>>((acc, curr) => {
        const id = curr.saved_queries_version_id;
        if (!acc[id]) acc[id] = [];
        acc[id].push(curr);
        return acc;
    }, {});
};

export async function up(knex: Knex): Promise<void> {
    const groupedResults = await getGroupedFields(knex);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promises: Promise<any>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(groupedResults).forEach((fields: any[]) => {
        fields.forEach((field, index) => {
            promises.push(
                knex('saved_queries_version_fields')
                    .update({
                        order: index,
                    })
                    .where(
                        'saved_queries_version_field_id',
                        field.saved_queries_version_field_id,
                    ),
            );
        });
    });

    await Promise.all(promises);
}

export async function down(knex: Knex): Promise<void> {
    const groupedResults = await getGroupedFields(knex);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promises: Promise<any>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(groupedResults).forEach((fields: any[]) => {
        const typeCounter: Record<string, number> = {
            dimension: 0,
            metric: 0,
        };
        fields.forEach((field) => {
            promises.push(
                knex('saved_queries_version_fields')
                    .update({
                        order: typeCounter[field.field_type] || 0,
                    })
                    .where(
                        'saved_queries_version_field_id',
                        field.saved_queries_version_field_id,
                    ),
            );
            typeCounter[field.field_type] += 1;
        });
    });
    await Promise.all(promises);
}
