import {
    getItemId,
    isExploreError,
    type CompiledTable,
    type Explore,
    type ExploreError,
    type SemanticStudioUnbuiltField,
    type WarehouseCatalog,
    type WarehouseTableSchema,
} from '@lightdash/common';

const COLUMN_REFERENCE = /\$\{TABLE\}\.["`[]?(\w+)/g;
const FIELD_REFERENCE = /\$\{(?:(\w+)\.)?(\w+)\}/g;

const findKey = <T>(record: Record<string, T> | undefined, key: string) =>
    Object.entries(record ?? {}).find(
        ([name]) => name.toLowerCase() === key.toLowerCase(),
    )?.[1];

/** A table's built columns, lower-cased; an empty set when its schema is known and the table is not there, null when nothing is known. */
const findBuiltColumns = (
    catalog: WarehouseCatalog,
    table: CompiledTable,
): Set<string> | null => {
    const schema = findKey(findKey(catalog, table.database), table.schema);
    if (!schema) return null;
    const columns: WarehouseTableSchema | undefined =
        findKey(schema, table.originalName ?? table.name) ??
        findKey(schema, table.name);
    return new Set(
        Object.keys(columns ?? {}).map((name) => name.toLowerCase()),
    );
};

const hasColumn = (columns: Set<string>, column: string) =>
    columns.has(column) ||
    // A nested column is kept under its dotted path.
    [...columns].some((name) => name.startsWith(`${column}.`));

/** The fields that read a column their built table does not have, and the fields defined on those. */
const findFieldsWithoutColumns = (
    explores: (Explore | ExploreError)[],
    catalog: WarehouseCatalog,
): SemanticStudioUnbuiltField[] => {
    const fields = explores.flatMap((explore) => {
        if (isExploreError(explore)) return [];
        const table = explore.tables[explore.baseTable];
        if (!table) return [];
        const columns = findBuiltColumns(catalog, table);
        return [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ].map((field) => ({ field, columns }));
    });
    const unbuilt = new Set<string>();
    fields.forEach(({ field, columns }) => {
        if (columns === null) return;
        const reads = [...field.sql.matchAll(COLUMN_REFERENCE)];
        if (
            reads.some(
                ([, column]) => !hasColumn(columns, column.toLowerCase()),
            )
        ) {
            unbuilt.add(getItemId(field));
        }
    });
    let found = -1;
    while (found !== unbuilt.size) {
        found = unbuilt.size;
        fields.forEach(({ field }) => {
            const reads = [...field.sql.matchAll(FIELD_REFERENCE)];
            if (
                reads.some(
                    ([, table, name]) =>
                        name !== 'TABLE' &&
                        unbuilt.has(
                            getItemId({ table: table ?? field.table, name }),
                        ),
                )
            ) {
                unbuilt.add(getItemId(field));
            }
        });
    }
    return fields.flatMap(({ field }) =>
        unbuilt.has(getItemId(field)) && !field.hidden
            ? [
                  {
                      model: field.table,
                      fieldId: getItemId(field),
                      label: field.label,
                  },
              ]
            : [],
    );
};

/**
 * The fields a draft adds or changes that cannot be queried until it merges and
 * its model is built; a field that is already missing its column in what is
 * published is not the draft's doing. The catalog is the project's last
 * compile, so a table built since then still reads as it was.
 */
export const findUnbuiltFields = (
    draft: (Explore | ExploreError)[],
    live: (Explore | ExploreError)[],
    catalog: WarehouseCatalog,
): SemanticStudioUnbuiltField[] => {
    const already = new Set(
        findFieldsWithoutColumns(live, catalog).map(({ fieldId }) => fieldId),
    );
    return findFieldsWithoutColumns(draft, catalog).filter(
        ({ fieldId }) => !already.has(fieldId),
    );
};
