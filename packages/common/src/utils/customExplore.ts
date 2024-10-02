import { ExploreCompiler } from '../compiler/exploreCompiler';
import { ExploreType, type Explore, type Table } from '../types/explore';
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
    customExploreName: string,
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
                table: customExploreName,
                fieldType: FieldType.DIMENSION,
                sql: `${fieldQuoteChar}${column.reference}${fieldQuoteChar}`,
                tableLabel: friendlyName(customExploreName),
                hidden: false,
            };
            return acc;
        },
        {},
    );

    const compiledTable: Table = {
        name: customExploreName,
        label: friendlyName(customExploreName),
        sqlTable: `(${sql})`, // Wrap the sql in a subquery to avoid issues with reserved words
        dimensions,
        metrics: {},
        lineageGraph: { nodes: [], edges: [] },
        database: warehouseClient.credentials.type,
        schema: '', // TODO: what should this be?
    };

    const explore = exploreCompiler.compileExplore({
        name: customExploreName,
        label: friendlyName(customExploreName),
        tags: [],
        baseTable: customExploreName,
        joinedTables: [],
        tables: { [customExploreName]: compiledTable },
        targetDatabase: warehouseClient.getAdapterType(),
    });

    return {
        ...explore,
        type: ExploreType.CUSTOM,
    };
};
