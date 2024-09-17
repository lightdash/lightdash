import { ExploreCompiler } from '../compiler/exploreCompiler';
import { type Explore, type Table } from '../types/explore';
import {
    DimensionType,
    FieldType,
    friendlyName,
    type Dimension,
} from '../types/field';
import { type WarehouseClient } from '../types/warehouse';
import { type VizColumn } from '../visualizations/types';
import { getFieldQuoteChar } from './warehouse';

export const createCustomExplore = (
    name: string,
    sql: string,
    columns: VizColumn[],
    warehouseClient: WarehouseClient,
): Explore => {
    const exploreCompiler = new ExploreCompiler(warehouseClient);

    const fieldQuoteChar = getFieldQuoteChar(warehouseClient.credentials.type);

    const dimensions = columns.reduce<Record<string, Dimension>>(
        (acc, column) => {
            acc[column.reference] = {
                name: column.reference,
                label: friendlyName(column.reference),
                type: column.type ?? DimensionType.STRING,
                table: name,
                fieldType: FieldType.DIMENSION,
                sql: `${fieldQuoteChar}${column.reference}${fieldQuoteChar}`,
                tableLabel: friendlyName(name),
                hidden: false,
            };
            return acc;
        },
        {},
    );

    const compiledTable: Table = {
        name,
        label: friendlyName(name),
        sqlTable: `(${sql})`, // Wrap the sql in a subquery to avoid issues with reserved words
        dimensions,
        metrics: {},
        lineageGraph: { nodes: [], edges: [] },
        database: warehouseClient.credentials.type,
        schema: '', // TODO: what should this be?
    };

    const explore = exploreCompiler.compileExplore({
        name,
        label: friendlyName(name),
        tags: [],
        baseTable: name,
        joinedTables: [],
        tables: { [name]: compiledTable },
        targetDatabase: warehouseClient.getAdapterType(),
    });

    return explore;
};
