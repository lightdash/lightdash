import {
    CatalogField,
    CatalogItemIcon,
    CatalogTable,
    CatalogType,
    CompiledDimension,
    CompiledMetric,
    CompiledTable,
    Explore,
    getBasicType,
    type Tag,
} from '@lightdash/common';
import { DbCatalog } from '../../../database/entities/catalog';

const parseFieldFromMetricOrDimension = (
    table: CompiledTable,
    field: CompiledMetric | CompiledDimension,
    {
        catalogSearchUuid,
        tags,
        categories,
        requiredAttributes,
        chartUsage,
        icon,
    }: {
        catalogSearchUuid: string;
        tags: string[];
        categories: Pick<Tag, 'tagUuid' | 'color' | 'name'>[];
        requiredAttributes: Record<string, string | string[]> | undefined;
        chartUsage: number | undefined;
        icon: CatalogItemIcon | null;
    },
): CatalogField => ({
    name: field.name,
    label: field.label,
    description: field.description,
    tableLabel: field.tableLabel,
    tableName: table.name,
    tableGroupLabel: table.groupLabel,
    fieldType: field.fieldType,
    basicType: getBasicType(field),
    type: CatalogType.Field,
    requiredAttributes,
    tags,
    categories,
    chartUsage,
    catalogSearchUuid,
    icon,
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
        catalog_tags: Pick<Tag, 'tagUuid' | 'name' | 'color'>[];
    },
): CatalogTable | CatalogField => {
    const baseTable = dbCatalog.explore.tables[dbCatalog.explore.baseTable];

    if (dbCatalog.type === CatalogType.Table) {
        return {
            catalogSearchUuid: dbCatalog.catalog_search_uuid,
            name: dbCatalog.name,
            label: dbCatalog.explore.label,
            groupLabel: dbCatalog.explore.groupLabel,
            description: dbCatalog.description || undefined,
            type: CatalogType.Table,
            requiredAttributes: dbCatalog.required_attributes ?? undefined,
            tags: dbCatalog.explore.tags,
            categories: dbCatalog.catalog_tags,
            chartUsage: dbCatalog.chart_usage ?? undefined,
            icon: dbCatalog.icon ?? null,
        };
    }

    const dimensionsAndMetrics = [
        ...Object.values(baseTable.dimensions),
        ...Object.values(baseTable.metrics),
    ];
    // This is the most computationally expensive part of the code
    // Perhaps we should add metadata (requiredAttributes) to the catalog database
    // or cache this somehow
    const findField = dimensionsAndMetrics.find(
        (d) => d.name === dbCatalog.name,
    );
    if (!findField) {
        throw new Error(
            `Field ${dbCatalog.name} not found in explore ${dbCatalog.explore.name}`,
        );
    }
    return parseFieldFromMetricOrDimension(baseTable, findField, {
        catalogSearchUuid: dbCatalog.catalog_search_uuid,
        tags: dbCatalog.explore.tags,
        categories: dbCatalog.catalog_tags,
        requiredAttributes: dbCatalog.required_attributes ?? undefined,
        chartUsage: dbCatalog.chart_usage ?? 0,
        icon: dbCatalog.icon ?? null,
    });
};
