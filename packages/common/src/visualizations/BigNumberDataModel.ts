import {
    CustomFormatType,
    DimensionType,
    type CompactOrAlias,
} from '../types/field';
import { type RawResultRow } from '../types/results';
import {
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    type ChartKind,
} from '../types/savedCharts';
import { type SqlRunnerQuery } from '../types/sqlRunner';
import {
    applyCustomFormat,
    getCustomFormatFromLegacy,
} from '../utils/formatting';
import {
    type PivotChartData,
    type PivotChartLayout,
    type VizBigNumberDisplay,
    type VizConfigErrors,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

const NOT_APPLICABLE = 'n/a';

export type BigNumberComparisonSpec = {
    /** Raw delta, or the fractional change when the format is percentage. */
    value: number | undefined;
    formattedValue: string;
    direction: ComparisonDiffTypes;
    label: string | undefined;
    tooltip: string;
};

export type BigNumberSpec = {
    value: unknown;
    formattedValue: string;
    label: string;
    showLabel: boolean;
    flipColors: boolean;
    comparison: BigNumberComparisonSpec | undefined;
};

/** Nothing selected yet: no value means no query and an empty spec. */
const defaultFieldConfig: PivotChartLayout = {
    x: undefined,
    y: [],
    groupBy: [],
};

export const calculateComparisonValue = (
    value: number,
    comparisonValue: number,
    format: ComparisonFormatTypes | undefined,
): number => {
    const rawValue = value - comparisonValue;
    return format === ComparisonFormatTypes.PERCENTAGE
        ? rawValue / Math.abs(comparisonValue)
        : rawValue;
};

const isNumeric = (value: unknown): value is number | string =>
    value !== null &&
    value !== undefined &&
    value !== '' &&
    !Number.isNaN(Number(value));

const formatValue = (value: unknown, style: CompactOrAlias | undefined) => {
    if (value === null || value === undefined) {
        return NOT_APPLICABLE;
    }
    if (!isNumeric(value)) {
        return String(value);
    }
    return applyCustomFormat(
        Number(value),
        getCustomFormatFromLegacy({ compact: style }),
    );
};

const getComparisonDirection = (delta: number): ComparisonDiffTypes => {
    if (delta > 0) return ComparisonDiffTypes.POSITIVE;
    if (delta < 0) return ComparisonDiffTypes.NEGATIVE;
    return ComparisonDiffTypes.NONE;
};

/**
 * Renders a single aggregated value from a SQL query. Unlike the other SQL
 * chart models there is no index — every row collapses into one aggregate per
 * selected field — so `fieldConfig.y[0]` is the value and `fieldConfig.y[1]`
 * is the optional comparison field.
 */
export class BigNumberDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly fieldConfig: PivotChartLayout;

    private pivotedChartData: PivotChartData | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner;
        fieldConfig?: PivotChartLayout;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.fieldConfig = args.fieldConfig ?? defaultFieldConfig;
    }

    getResultOptions() {
        return {
            metricFieldOptions: this.resultsRunner.getPivotQueryMetrics(),
            customMetricFieldOptions:
                this.resultsRunner.getPivotQueryCustomMetrics(),
        };
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const { metricFieldOptions, customMetricFieldOptions } =
            this.getResultOptions();

        const numericCustomMetrics = customMetricFieldOptions.filter(
            (field) => field.dimensionType === DimensionType.NUMBER,
        );

        const valueField =
            metricFieldOptions[0] ??
            numericCustomMetrics[0] ??
            customMetricFieldOptions[0];

        if (valueField === undefined) {
            return undefined;
        }

        return {
            x: undefined,
            y: [
                {
                    reference: valueField.reference,
                    aggregation: valueField.aggregation,
                },
            ],
            groupBy: [],
        };
    }

    mergeConfig(
        chartKind: ChartKind.BIG_NUMBER,
        currentVizConfig?: {
            fieldConfig: PivotChartLayout | undefined;
            display: VizBigNumberDisplay | undefined;
        },
    ) {
        const newDefaultLayout = this.getDefaultLayout();

        const currentFields = currentVizConfig?.fieldConfig?.y ?? [];
        const currentLayoutIsStillValid =
            currentFields.length > 0 &&
            this.getUnknownReferences(currentFields).length === 0;

        return {
            metadata: { version: 1 },
            type: chartKind,
            fieldConfig: currentLayoutIsStillValid
                ? currentVizConfig?.fieldConfig
                : (newDefaultLayout ?? currentVizConfig?.fieldConfig),
            display: currentVizConfig?.display ?? {},
        };
    }

    /**
     * References in `y` that the current results can't provide, either as a
     * pre-aggregated metric or as a custom metric over a dimension.
     */
    private getUnknownReferences(fields: PivotChartLayout['y']): string[] {
        const { metricFieldOptions, customMetricFieldOptions } =
            this.getResultOptions();
        const knownReferences = new Set(
            [...metricFieldOptions, ...customMetricFieldOptions].map(
                (option) => option.reference,
            ),
        );

        return fields
            .map((field) => field.reference)
            .filter((reference) => !knownReferences.has(reference));
    }

    getConfigErrors(config?: PivotChartLayout): VizConfigErrors | undefined {
        if (!config) {
            return undefined;
        }

        const unknownReferences = this.getUnknownReferences(config.y ?? []);

        return unknownReferences.length > 0
            ? { metricFieldError: { references: unknownReferences } }
            : undefined;
    }

    async getPivotedChartData({
        sortBy,
        filters,
        limit,
        sql,
    }: Pick<SqlRunnerQuery, 'sortBy' | 'filters' | 'limit' | 'sql'>): Promise<
        PivotChartData | undefined
    > {
        const allDimensionNames = new Set(
            this.resultsRunner
                .getPivotQueryDimensions()
                .map((d) => d.reference),
        );

        const { customMetrics, metrics } = (this.fieldConfig.y ?? []).reduce<{
            customMetrics: Required<SqlRunnerQuery>['customMetrics'];
            metrics: SqlRunnerQuery['metrics'];
        }>(
            (acc, field) => {
                if (allDimensionNames.has(field.reference)) {
                    const name = `${field.reference}_${field.aggregation}`;
                    acc.customMetrics.push({
                        name,
                        baseDimension: field.reference,
                        aggType: field.aggregation,
                    });
                    acc.metrics.push({ name });
                } else {
                    acc.metrics.push({ name: field.reference });
                }
                return acc;
            },
            { customMetrics: [], metrics: [] },
        );

        const query: SqlRunnerQuery = {
            sql,
            limit,
            filters,
            sortBy,
            metrics,
            dimensions: [],
            timeDimensions: [],
            pivot: {
                index: [],
                on: [],
                values: metrics.map((metric) => metric.name),
            },
            customMetrics,
        };

        this.pivotedChartData =
            await this.resultsRunner.getPivotedVisualizationData(query);

        return this.pivotedChartData;
    }

    getPivotedTableData():
        | { columns: string[]; rows: RawResultRow[] }
        | undefined {
        const transformedData = this.pivotedChartData;
        if (!transformedData) {
            return undefined;
        }
        return {
            columns: Object.keys(transformedData.results[0] ?? {}),
            rows: transformedData.results,
        };
    }

    getDataDownloadUrl(): string | undefined {
        return this.pivotedChartData?.fileUrl;
    }

    /**
     * Compares the value against the second selected field. Returns undefined
     * when there is nothing to compare against.
     */
    private static buildComparison(
        value: unknown,
        comparisonValue: unknown,
        comparisonField: string,
        display: VizBigNumberDisplay,
    ): BigNumberComparisonSpec {
        if (!isNumeric(value) || !isNumeric(comparisonValue)) {
            return {
                value: undefined,
                formattedValue: NOT_APPLICABLE,
                direction:
                    comparisonValue === undefined || comparisonValue === null
                        ? ComparisonDiffTypes.UNDEFINED
                        : ComparisonDiffTypes.NAN,
                label: display.comparisonLabel,
                tooltip: 'Comparison field has no comparable value',
            };
        }

        const format = display.comparisonFormat ?? ComparisonFormatTypes.RAW;
        const delta = calculateComparisonValue(
            Number(value),
            Number(comparisonValue),
            format,
        );
        const direction = getComparisonDirection(delta);
        // Only a decrease carries its own sign.
        const prefix = direction === ComparisonDiffTypes.NEGATIVE ? '' : '+';
        const formattedValue =
            format === ComparisonFormatTypes.PERCENTAGE
                ? `${prefix}${applyCustomFormat(delta, {
                      round: 0,
                      type: CustomFormatType.PERCENT,
                  })}`
                : `${prefix}${formatValue(delta, display.style)}`;

        return {
            value: delta,
            formattedValue,
            direction,
            label: display.comparisonLabel,
            tooltip:
                direction === ComparisonDiffTypes.NONE
                    ? `No change compared to ${comparisonField}`
                    : `${formattedValue} compared to ${comparisonField}`,
        };
    }

    getSpec(display?: VizBigNumberDisplay): BigNumberSpec | undefined {
        const transformedData = this.pivotedChartData;

        if (!transformedData) {
            return undefined;
        }

        const [valueColumn, comparisonColumn] = transformedData.valuesColumns;
        const row = transformedData.results[0];
        const value =
            valueColumn && row ? row[valueColumn.pivotColumnName] : undefined;

        const showComparison =
            !!display?.showComparison && !!comparisonColumn && !!row;

        return {
            value,
            formattedValue: formatValue(value, display?.style),
            label:
                display?.label ||
                this.fieldConfig.y?.[0]?.reference ||
                valueColumn?.referenceField ||
                '',
            showLabel: display?.showLabel ?? true,
            flipColors: display?.flipColors ?? false,
            comparison: showComparison
                ? BigNumberDataModel.buildComparison(
                      value,
                      row[comparisonColumn.pivotColumnName],
                      comparisonColumn.referenceField,
                      display,
                  )
                : undefined,
        };
    }
}
