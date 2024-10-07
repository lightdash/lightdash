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

export const createVirtualView = (
    virtualViewName: string,
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
                table: virtualViewName,
                fieldType: FieldType.DIMENSION,
                sql: `${fieldQuoteChar}${column.reference}${fieldQuoteChar}`,
                tableLabel: friendlyName(virtualViewName),
                hidden: false,
            };
            return acc;
        },
        {},
    );

    const compiledTable: Table = {
        name: virtualViewName,
        label: friendlyName(virtualViewName),
        sqlTable: `(${sql})`, // Wrap the sql in a subquery to avoid issues with reserved words
        dimensions,
        metrics: {},
        lineageGraph: { nodes: [], edges: [] },
        database: warehouseClient.credentials.type,
        schema: '', // TODO: what should this be?
    };

    const explore = exploreCompiler.compileExplore({
        name: virtualViewName,
        label: friendlyName(virtualViewName),
        tags: [],
        baseTable: virtualViewName,
        joinedTables: [],
        tables: { [virtualViewName]: compiledTable },
        targetDatabase: warehouseClient.getAdapterType(),
    });

    const virtualView = {
        ...explore,
        type: ExploreType.VIRTUAL,
    };

    return virtualView;
};
