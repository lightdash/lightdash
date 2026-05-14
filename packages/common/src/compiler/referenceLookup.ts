import type { Table } from '../types/explore';
import type {
    CompiledDimension,
    CompiledMetric,
    Dimension,
    Metric,
} from '../types/field';

type TableWithName = Pick<Table, 'name' | 'originalName'>;
type TableWithDimensions<TDimension extends Dimension | CompiledDimension> =
    TableWithName & {
        dimensions: Record<string, TDimension>;
    };
type TableWithMetrics<TMetric extends Metric | CompiledMetric> =
    TableWithName & {
        metrics: Record<string, TMetric>;
    };

export const getReferencedTable = <TTable extends TableWithName>(
    refTable: string,
    tables: Record<string, TTable>,
): TTable | undefined => {
    if (tables[refTable]) {
        return tables[refTable];
    }

    return Object.values(tables).find(
        (table) => table.name === refTable || table.originalName === refTable,
    );
};

export const getReferencedDimension = <
    TTable extends TableWithDimensions<TDimension>,
    TDimension extends Dimension | CompiledDimension,
>(
    refTable: string,
    refName: string,
    tables: Record<string, TTable>,
): TDimension | undefined =>
    getReferencedTable(refTable, tables)?.dimensions[refName];

export const getReferencedMetric = <
    TTable extends TableWithMetrics<TMetric>,
    TMetric extends Metric | CompiledMetric,
>(
    refTable: string,
    refName: string,
    tables: Record<string, TTable>,
): TMetric | undefined =>
    getReferencedTable(refTable, tables)?.metrics[refName];

export const getReferencedDimensionCaseInsensitive = <
    TTable extends TableWithDimensions<TDimension>,
    TDimension extends Dimension | CompiledDimension,
>(
    refTable: string,
    refName: string,
    tables: Record<string, TTable>,
): TDimension | undefined => {
    const table = tables[refTable];

    if (!table) {
        return undefined;
    }

    // NOTE: date dimensions from explores have their time format uppercased
    // (e.g. order_date_DAY) - see ticket:
    // https://github.com/lightdash/lightdash/issues/5998
    const dimensionRefName = Object.keys(table.dimensions).find(
        (key) => key.toLowerCase() === refName.toLowerCase(),
    );

    return dimensionRefName ? table.dimensions[dimensionRefName] : undefined;
};
