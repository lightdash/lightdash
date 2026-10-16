import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import {
    ChartKind,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
} from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import { type AllVizChartConfig } from '../../visualizations/types';
import { type DataAppVizSelectedFields } from '../apps/dataAppVizChartConfigValidation';
import { type DataAppVizFieldType } from '../apps/types';

/** A composer result rendered through a project custom chart type (data app viz). */
export type ComposerCustomVizConfig = {
    type: ChartKind.DATA_APP_VIZ;
    metadata: { version: 1 };
    dataAppVizUuid: string;
    dataAppVizVersion: number;
    fieldMapping: DataAppVizFieldMapping;
    optionValues: DataAppVizOptionValues;
};

/** The stored composer viz config: a built-in kind or a custom chart type. */
export type ComposerVizConfig = AllVizChartConfig | ComposerCustomVizConfig;

export const isComposerCustomVizConfig = (
    vizConfig: ComposerVizConfig,
): vizConfig is ComposerCustomVizConfig =>
    vizConfig.type === ChartKind.DATA_APP_VIZ;

/** Every field id a custom config binds, in slot order. */
export const getComposerCustomVizBoundFields = (
    vizConfig: ComposerCustomVizConfig,
): string[] =>
    Object.values(vizConfig.fieldMapping).flatMap((value) =>
        Array.isArray(value) ? value : [value],
    );

/**
 * Result columns split by kind for custom chart type validation: a semantic
 * layer node declares its dimensions and metrics (other columns are table
 * calculations); otherwise numeric columns are metrics and the rest dimensions.
 */
export const getComposerCustomVizSelectedFields = (
    columns: ResultColumn[],
    node: SourceQuery | null,
): DataAppVizSelectedFields => {
    const references = columns.map((column) => column.reference);
    if (node?.sourceType === QuerySourceType.SEMANTIC_LAYER) {
        const dimensions = new Set<string>(node.dimensions);
        const metrics = new Set<string>(node.metrics);
        return {
            dimensions: references.filter((ref) => dimensions.has(ref)),
            metrics: references.filter((ref) => metrics.has(ref)),
            tableCalculations: references.filter(
                (ref) => !dimensions.has(ref) && !metrics.has(ref),
            ),
        };
    }
    return {
        dimensions: columns
            .filter((column) => column.type !== DimensionType.NUMBER)
            .map((column) => column.reference),
        metrics: columns
            .filter((column) => column.type === DimensionType.NUMBER)
            .map((column) => column.reference),
        tableCalculations: [],
    };
};

export type ComposerCustomVizPools = {
    /** For dimension and series slots. */
    dimension: string[];
    /** For metric slots: metrics then table calculations. */
    metric: string[];
    /** For column slots: metrics, table calculations, then dimensions. */
    column: string[];
};

/** Column ids each slot type may bind, consistent with the custom chart type validator. */
export const getComposerCustomVizPools = (
    columns: ResultColumn[],
    node: SourceQuery | null,
): ComposerCustomVizPools => {
    const selected = getComposerCustomVizSelectedFields(columns, node);
    const metric = [...selected.metrics, ...selected.tableCalculations];
    return {
        dimension: selected.dimensions,
        metric,
        column: [...metric, ...selected.dimensions],
    };
};

export const getComposerCustomVizPool = (
    pools: ComposerCustomVizPools,
    slotType: DataAppVizFieldType,
): string[] => {
    switch (slotType) {
        case 'dimension':
        case 'series':
            return pools.dimension;
        case 'metric':
            return pools.metric;
        case 'column':
            return pools.column;
        default:
            return assertUnreachable(slotType, 'Unknown slot type');
    }
};
