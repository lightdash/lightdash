import {
    convertToAiHints,
    DEFAULT_FILTER_CASE_SENSITIVE,
    DimensionType,
    Explore,
    FieldType,
    getFilterTypeFromItemType,
    getItemId,
    isEmojiIcon,
    type CatalogField,
    type Dimension,
    type Metric,
} from '@lightdash/common';

export type RenderableField = Pick<
    CatalogField,
    | 'name'
    | 'label'
    | 'fieldType'
    | 'fieldValueType'
    | 'tableName'
    | 'description'
> &
    Partial<
        Pick<
            CatalogField,
            | 'searchRank'
            | 'chartUsage'
            | 'verifiedChartUsage'
            | 'aiHints'
            | 'categories'
            | 'icon'
        >
    >;

export const getFieldCaseSensitive = (
    field: RenderableField,
    explore?: Explore,
): boolean | null => {
    if (
        field.fieldType !== FieldType.DIMENSION ||
        field.fieldValueType !== DimensionType.STRING
    ) {
        return null;
    }

    const dimension = explore?.tables[field.tableName]?.dimensions[field.name];

    return (
        dimension?.caseSensitive ??
        explore?.caseSensitive ??
        DEFAULT_FILTER_CASE_SENSITIVE
    );
};

export const getIsFromJoinedTable = (
    field: Pick<RenderableField, 'tableName'>,
    explore?: Explore,
): boolean =>
    Boolean(
        explore &&
        field.tableName !== explore.baseTable &&
        explore.joinedTables.some((join) => join.table === field.tableName),
    );

export const toRenderableField = (
    field: Dimension | Metric,
): RenderableField => ({
    name: field.name,
    label: field.label,
    tableName: field.table,
    fieldType: field.fieldType,
    fieldValueType: field.type,
    description: field.description,
    aiHints: convertToAiHints(field.aiHint) ?? null,
});

export const fieldToJson = ({
    field,
    explore,
}: {
    field: RenderableField;
    explore?: Explore;
}) => {
    const isFromJoinedTable = getIsFromJoinedTable(field, explore);
    const caseSensitiveFilters = getFieldCaseSensitive(field, explore);
    const aiHints = convertToAiHints(field.aiHints ?? undefined);

    return {
        type: field.fieldType,
        baseTable: field.tableName,
        name: field.name,
        fieldId: getItemId({
            name: field.name,
            table: field.tableName,
        }),
        fieldType: field.fieldValueType,
        fieldFilterType: getFilterTypeFromItemType(field.fieldValueType),
        searchRank: field.searchRank,
        chartUsage: field.chartUsage,
        usageInVerifiedCharts: field.verifiedChartUsage ?? 0,
        isFromJoinedTable,
        caseSensitiveFilters,
        joinedTableNote:
            isFromJoinedTable && explore
                ? `This field is from the "${field.tableName}" table, which is joined to the "${explore.name}" explore. You can use this field in queries and filters just like fields from the base table.`
                : undefined,
        label: field.label,
        aiHints,
        description: field.description,
        categories: field.categories?.map((c) => c.name),
        emoji:
            field.icon && isEmojiIcon(field.icon)
                ? field.icon.unicode
                : undefined,
    };
};

export type FieldOutput = ReturnType<typeof fieldToJson>;
