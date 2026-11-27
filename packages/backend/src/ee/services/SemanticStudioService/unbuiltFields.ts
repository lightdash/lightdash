import {
    findCatalogColumn,
    getItemId,
    getTableColumnReferences,
    indexWarehouseCatalog,
    isExploreError,
    parseAllReferences,
    type Explore,
    type ExploreError,
    type SemanticStudioUnbuiltField,
    type WarehouseCatalog,
    type WarehouseTableSchema,
} from '@lightdash/common';

/** A field the warehouse cannot answer, and the explore whose model it belongs to. */
type FieldWithoutColumn = SemanticStudioUnbuiltField & { explore: string };

const isBuilt = (columns: WarehouseTableSchema, column: string) =>
    findCatalogColumn(columns, column, false) !== undefined ||
    // A nested column is kept under its dotted path, without its parent.
    Object.keys(columns).some((name) =>
        name.toLowerCase().startsWith(`${column.toLowerCase()}.`),
    );

/**
 * The fields that read a column their model's built table does not have, and
 * the fields defined on those. A model the catalog does not know is skipped,
 * unless it is new, where no field has a table to read. The catalog is the
 * project's last compile, so a table built since then still reads as it was.
 */
export const findFieldsWithoutColumns = (
    explores: (Explore | ExploreError)[],
    catalog: WarehouseCatalog,
    isNewModel: (exploreName: string) => boolean,
): FieldWithoutColumn[] => {
    const { lookup } = indexWarehouseCatalog(catalog, false);
    const fields = explores.flatMap((explore) => {
        if (isExploreError(explore)) return [];
        const table = explore.tables[explore.baseTable];
        if (!table) return [];
        const built = lookup(
            table.database,
            table.schema,
            table.originalName ?? table.name,
        );
        if (!built && !isNewModel(explore.name)) return [];
        return [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ].map((field) => ({
            field,
            explore: explore.name,
            lacksColumn:
                !built ||
                getTableColumnReferences(field.sql).some(
                    (column) => !isBuilt(built.columns, column),
                ),
        }));
    });
    const unbuilt = new Set(
        fields.flatMap(({ field, lacksColumn }) =>
            lacksColumn ? [getItemId(field)] : [],
        ),
    );
    // A field defined on an unbuilt one cannot be queried either.
    let found = 0;
    while (found !== unbuilt.size) {
        found = unbuilt.size;
        fields.forEach(({ field }) => {
            const reads = parseAllReferences(field.sql, field.table);
            if (
                reads.some(({ refTable, refName }) =>
                    unbuilt.has(getItemId({ table: refTable, name: refName })),
                )
            ) {
                unbuilt.add(getItemId(field));
            }
        });
    }
    return fields.flatMap(({ field, explore }) =>
        unbuilt.has(getItemId(field)) && !field.hidden
            ? [
                  {
                      explore,
                      model: field.table,
                      fieldId: getItemId(field),
                      label: field.label,
                  },
              ]
            : [],
    );
};

/** The fields a draft leaves unbuilt, without those already missing their column in what is published: those are not the draft's doing. */
export const dropAlreadyMissing = (
    draft: FieldWithoutColumn[],
    published: FieldWithoutColumn[],
): SemanticStudioUnbuiltField[] => {
    const already = new Set(published.map(({ fieldId }) => fieldId));
    return draft
        .filter(({ fieldId }) => !already.has(fieldId))
        .map(({ model, fieldId, label }) => ({ model, fieldId, label }));
};
