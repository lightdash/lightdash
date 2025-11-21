import {
    CatalogField,
    CatalogItemIcon,
    CatalogTable,
    CatalogType,
    CompiledDimension,
    CompiledMetric,
    CompiledTable,
    convertToAiHints,
    Explore,
    getBasicType,
    type Tag,
} from '@lightdash/common';
import { DbCatalog } from '../../../database/entities/catalog';

const parseFieldFromMetricOrDimension = (
    table: CompiledTable,
    field: CompiledMetric | CompiledDimension,
    catalogArgs: {
        label: string | null;
        description: string | null;
        catalogSearchUuid: string;
        tags: string[];
        categories: Pick<Tag, 'tagUuid' | 'color' | 'name' | 'yamlReference'>[];
        requiredAttributes: Record<string, string | string[]> | undefined;
        chartUsage: number | undefined;
        icon: CatalogItemIcon | null;
        searchRank?: number;
    },
): CatalogField => ({
    name: field.name,
    label: catalogArgs.label ?? '',
    description: catalogArgs.description ?? '',
    tableLabel: field.tableLabel,
    tableName: table.name,
    tableGroupLabel: table.groupLabel,
    fieldType: field.fieldType,
    basicType: getBasicType(field),
    fieldValueType: field.type,
    type: CatalogType.Field,
    aiHints: convertToAiHints(field.aiHint) ?? null,
    requiredAttributes: catalogArgs.requiredAttributes,
    tags: catalogArgs.tags,
    categories: catalogArgs.categories,
    chartUsage: catalogArgs.chartUsage,
    catalogSearchUuid: catalogArgs.catalogSearchUuid,
    icon: catalogArgs.icon,
    searchRank: catalogArgs.searchRank,
});

export const parseFieldsFromCompiledTable = (
    table: CompiledTable,
): CatalogField[] => {
    const tableFields = [
        ...Object.values(table.dimensions).filter((d) => !d.isIntervalBase),
        ...Object.values(table.metrics),
    ].filter((f) => !f.hidden); // Filter out hidden fields from catalog
    return tableFields.map((field) =>
        parseFieldFromMetricOrDimension(table, field, {
            label: field.label,
            description: field.description ?? '',
            tags: [],
            categories: [],
            requiredAttributes:
                field.requiredAttributes ?? table.requiredAttributes,
            // ! since we're not pulling from the catalog search table these do not exist (keep compatibility with data catalog)
            chartUsage: undefined,
            catalogSearchUuid: '',
            icon: null,
        }),
    );
};

export const parseCatalog = (
    dbCatalog: DbCatalog & {
        explore: Explore;
        catalog_tags: Pick<
            Tag,
            'tagUuid' | 'name' | 'color' | 'yamlReference'
        >[];
        search_rank: number;
    },
): CatalogTable | CatalogField => {
    const baseTable = dbCatalog.explore.tables[dbCatalog.explore.baseTable];

    if (dbCatalog.type === CatalogType.Table) {
        return {
            catalogSearchUuid: dbCatalog.catalog_search_uuid,
            name: dbCatalog.name,
            label: dbCatalog.label ?? dbCatalog.explore.label,
            groupLabel: dbCatalog.explore.groupLabel,
            description: dbCatalog.description || undefined,
            type: CatalogType.Table,
            requiredAttributes: dbCatalog.required_attributes ?? undefined,
            tags: dbCatalog.explore.tags,
            categories: dbCatalog.catalog_tags,
            chartUsage: dbCatalog.chart_usage ?? undefined,
            icon: dbCatalog.icon ?? null,
            aiHints: convertToAiHints(dbCatalog.explore.aiHint) ?? null,
            joinedTables: dbCatalog.joined_tables ?? null,
            searchRank: dbCatalog.search_rank,
        };
    }

    // Find the correct table that contains this field
    // This is important for fields from joined tables which may not be in the base table
    const catalogTable = dbCatalog.explore.tables[dbCatalog.table_name];

    const dimensionsAndMetrics = [
        ...Object.values(catalogTable.dimensions),
        ...Object.values(catalogTable.metrics),
    ];
    // This is the most computationally expensive part of the code
    // Perhaps we should add metadata (requiredAttributes) to the catalog database
    // or cache this somehow
    const findField = dimensionsAndMetrics.find(
        (d) => d.name === dbCatalog.name,
    );
    if (!findField) {
        throw new Error(
            `Field ${dbCatalog.name} not found in table ${dbCatalog.table_name} of explore ${dbCatalog.explore.name}`,
        );
    }
    return parseFieldFromMetricOrDimension(catalogTable, findField, {
        label: dbCatalog.label,
        description: dbCatalog.description,
        catalogSearchUuid: dbCatalog.catalog_search_uuid,
        tags: dbCatalog.explore.tags,
        categories: dbCatalog.catalog_tags,
        requiredAttributes: dbCatalog.required_attributes ?? undefined,
        chartUsage: dbCatalog.chart_usage ?? 0,
        icon: dbCatalog.icon ?? null,
        searchRank: dbCatalog.search_rank,
    });
};
