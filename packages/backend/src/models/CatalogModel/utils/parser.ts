import {
    CatalogField,
    CatalogTable,
    CatalogType,
    CompiledDimension,
    CompiledMetric,
    CompiledTable,
    Explore,
    getBasicType,
} from '@lightdash/common';
import { DbCatalog } from '../../../database/entities/catalog';

const parseFieldFromMetricOrDimension = (
    table: CompiledTable,
    field: CompiledMetric | CompiledDimension,
): CatalogField => ({
    name: field.name,
    description: field.description,
    tableLabel: field.tableLabel,
    tableName: table.name,
    tableGroupLabel: table.groupLabel,
    fieldType: field.fieldType,
    basicType: getBasicType(field),
    type: CatalogType.Field,
    requiredAttributes: field?.requiredAttributes || table.requiredAttributes,
});

export const parseFieldsFromCompiledTable = (
    table: CompiledTable,
): CatalogField[] => {
    const tableFields = [
        ...Object.values(table.dimensions),
        ...Object.values(table.metrics),
    ];
    return tableFields.map((field) =>
        parseFieldFromMetricOrDimension(table, field),
    );
};

export const parseCatalog = (
    dbCatalog: DbCatalog & { explore: Explore },
): CatalogTable | CatalogField => {
    const baseTable = dbCatalog.explore.tables[dbCatalog.explore.baseTable];

    if (dbCatalog.type === CatalogType.Table) {
        return {
            name: dbCatalog.name,
            groupLabel: dbCatalog.explore.groupLabel,
            description: dbCatalog.description || undefined,
            type: CatalogType.Table,
            requiredAttributes: baseTable.requiredAttributes,
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
    return parseFieldFromMetricOrDimension(baseTable, findField);
};
