import { DimensionType } from '../types/field';
import {
    type DuckdbSourceQuery,
    type QueryNodeId,
} from '../types/querySources';
import { type ResultColumn } from '../types/results';
import {
    ChartType,
    isCartesianChartConfig,
    type ChartConfig,
    type SavedChart,
} from '../types/savedCharts';
import assertUnreachable from '../utils/assertUnreachable';
import {
    buildComposerChartStage,
    COMPOSER_RESULT_TABLE_NAME,
    getComposerQueryOverReferences,
    getComposerResultFieldId,
    type ComposerRunQueryChart,
    type ComposerSeriesSplitReferences,
} from './composerChartVizConfig';

/** What a composer chart stores about its drawing: the chart config and pivot columns over composer result field ids. */
export type ComposerChartVisualization = Pick<
    SavedChart,
    'chartConfig' | 'pivotConfig'
>;

const FIELD_ID_PREFIX = `${COMPOSER_RESULT_TABLE_NAME}_`;

/**
 * The result column a composer result field id was minted from. Field ids
 * write "." as "__", so a reference that itself contains "__" does not
 * round-trip; the save step owns refusing those.
 */
export const getComposerResultReference = (fieldId: string): string => {
    if (!fieldId.startsWith(FIELD_ID_PREFIX)) {
        throw new Error(`"${fieldId}" is not a composer result field`);
    }
    return fieldId.slice(FIELD_ID_PREFIX.length).replaceAll('__', '.');
};

const unique = (values: string[]) => [...new Set(values)];

/** The split a stored chart config describes: its pivot columns over a cartesian x and y; null without pivot columns. */
const getSeriesSplitReferences = ({
    chartConfig,
    pivotConfig,
}: ComposerChartVisualization): ComposerSeriesSplitReferences | null => {
    const split = unique(pivotConfig?.columns ?? []);
    if (split.length === 0) return null;
    if (
        chartConfig.type !== ChartType.CARTESIAN ||
        !isCartesianChartConfig(chartConfig.config)
    ) {
        throw new Error(
            'A series split needs a cartesian chart with x and y fields',
        );
    }
    const { xField, yField } = chartConfig.config.layout;
    if (!xField || !yField || yField.length === 0) {
        throw new Error(
            'A series split needs a cartesian chart with x and y fields',
        );
    }
    return {
        index: [getComposerResultReference(xField)],
        split: split.map(getComposerResultReference),
        values: unique(yField).map(getComposerResultReference),
    };
};

/**
 * The DuckDB series-split stage a composer chart runs over its terminal
 * node, from the stored chart config and pivot columns alone; null when the
 * chart has no split. source is the terminal node's id or result query uuid.
 */
export const getComposerChartSeriesSplitStage = ({
    chartVisualization,
    nodeId,
    source,
}: {
    chartVisualization: ComposerChartVisualization;
    nodeId: QueryNodeId;
    source: string;
}): DuckdbSourceQuery | null => {
    const references = getSeriesSplitReferences(chartVisualization);
    if (!references) return null;
    return buildComposerChartStage({ references, nodeId, source });
};

type FieldRoles = { dimensions: string[]; metrics: string[] };

/** Which stored field ids a chart draws as dimensions and as metrics; a table draws every live column. */
const getFieldRoles = (
    chartConfig: ChartConfig,
    pivotColumns: string[],
    columns: ResultColumn[],
): FieldRoles => {
    const fieldIds = columns.map((column) => ({
        fieldId: getComposerResultFieldId(column.reference),
        numeric: column.type === DimensionType.NUMBER,
    }));
    const firstNumeric = fieldIds.find(({ numeric }) => numeric)?.fieldId;
    const firstNonNumeric = fieldIds.find(({ numeric }) => !numeric)?.fieldId;
    const { type } = chartConfig;
    switch (type) {
        case ChartType.CARTESIAN: {
            const layout = isCartesianChartConfig(chartConfig.config)
                ? chartConfig.config.layout
                : undefined;
            const dimensions = unique([
                ...(layout?.xField ? [layout.xField] : []),
                ...pivotColumns,
            ]);
            return {
                dimensions,
                metrics: unique(layout?.yField ?? []).filter(
                    (fieldId) => !dimensions.includes(fieldId),
                ),
            };
        }
        case ChartType.TABLE:
            return {
                dimensions: fieldIds
                    .filter(({ numeric }) => !numeric)
                    .map(({ fieldId }) => fieldId),
                metrics: fieldIds
                    .filter(({ numeric }) => numeric)
                    .map(({ fieldId }) => fieldId),
            };
        case ChartType.BIG_NUMBER: {
            const value = chartConfig.config?.selectedField ?? firstNumeric;
            return { dimensions: [], metrics: value ? [value] : [] };
        }
        case ChartType.PIE:
            return {
                dimensions: chartConfig.config?.groupFieldIds ?? [],
                metrics: chartConfig.config?.metricId
                    ? [chartConfig.config.metricId]
                    : [],
            };
        case ChartType.FUNNEL: {
            // Stage labels come from the first non-numeric column, as at save.
            const value = chartConfig.config?.fieldId ?? firstNumeric;
            return {
                dimensions: firstNonNumeric ? [firstNonNumeric] : [],
                metrics: value ? [value] : [],
            };
        }
        case ChartType.DATA_APP_VIZ:
            throw new Error(
                'Custom chart types are not supported on composer charts',
            );
        case ChartType.CUSTOM:
        case ChartType.TREEMAP:
        case ChartType.GAUGE:
        case ChartType.MAP:
        case ChartType.SANKEY:
            throw new Error(
                `${type} charts are not supported on composer charts`,
            );
        default:
            return assertUnreachable(type, `Unknown chart type ${type}`);
    }
};

/**
 * The runQuery chart a composer chart draws at view time: field roles from
 * the stored chart config, fields typed and labelled by the run's live
 * columns, keyed by composer result field id.
 */
export const getComposerChartRunQueryChart = ({
    chartVisualization: { chartConfig, pivotConfig },
    columns,
}: {
    chartVisualization: ComposerChartVisualization;
    columns: ResultColumn[];
}): ComposerRunQueryChart => {
    const pivotColumns = pivotConfig?.columns ?? [];
    const roles = getFieldRoles(chartConfig, pivotColumns, columns);
    const byFieldId = new Map(
        columns.map((column) => [
            getComposerResultFieldId(column.reference),
            column.reference,
        ]),
    );
    const toReference = (fieldId: string): string => {
        const reference = byFieldId.get(fieldId);
        if (reference === undefined) {
            throw new Error(`Column "${fieldId}" is not in the result`);
        }
        return reference;
    };
    return {
        ...getComposerQueryOverReferences(
            columns,
            roles.dimensions.map(toReference),
            roles.metrics.map(toReference),
        ),
        chartConfig,
        pivotColumns,
    };
};
