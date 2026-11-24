import {
    ChartType,
    compareSemverVersions,
    getDataAppVizChartConfigErrors,
    type ChartAsCode,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';

export type LibraryChartBinding = {
    slug: string; // registry slug
    minVersion: string; // registry semver the mapping was written against
    fieldMapping: DataAppVizFieldMapping;
    optionValues: DataAppVizOptionValues;
    // Query the library chart runs in place of the fallback's; null when it shares the fallback query.
    query: {
        dimensions: string[];
        metrics: string[];
        sorts: ChartAsCode['metricQuery']['sorts'];
        limit: number;
        // Calculations over the library chart's own rows. They may only use the fields listed above.
        tableCalculations?: ChartAsCode['metricQuery']['tableCalculations'];
        // Chart description for the library rendering's own query.
        description: string;
    } | null;
};

// A chart type installed in the project, with its latest renderable schema.
export type UsableLibraryChartType = {
    appSlug: string;
    vizSchema: DataAppVizSchema;
    registryVersion: string;
};

export type RejectedLibraryChart = {
    chartSlug: string;
    typeSlug: string;
    reason: 'version' | 'schema';
    errors: string[];
};

// A version that cannot be compared counts as too old.
const meetsMinVersion = (installed: string, minVersion: string): boolean => {
    try {
        return compareSemverVersions(installed, minVersion) >= 0;
    } catch {
        return false;
    }
};

// Field names each supported type accepts, and which are required.
export const libraryChartFields: Record<
    string,
    { fields: readonly string[]; required: readonly string[] }
> = {
    heatmap: { fields: ['x', 'y', 'value'], required: ['x', 'y', 'value'] },
    'vega-trellis': {
        fields: ['x', 'value', 'panel'],
        required: ['x', 'value'],
    },
    'sortable-pivot-table': {
        fields: ['rowDimension', 'rowDimension2', 'series', 'metric'],
        required: ['rowDimension', 'metric'],
    },
    'customizable-cartesian-chart': {
        fields: ['x', 'm1', 'm2', 'm3', 'm4', 'splitBy'],
        required: ['x', 'm1'],
    },
    'big-number-with-sparkline-trend': {
        fields: [
            'value',
            'comparisonValue',
            'time',
            'sparklineMetric',
            'comparisonValue2',
            'comparisonValue3',
            'secondary',
            'target',
        ],
        required: ['value'],
    },
    'word-cloud': {
        fields: ['word', 'size', 'colorBy'],
        required: ['word', 'size'],
    },
};

// Option names each supported type accepts. An option added after the type was first bound carries the
// version that introduced it: a binding that sets it must ask for at least that version.
const sinceFirstBinding = (names: string): Record<string, string | null> =>
    Object.fromEntries(names.split(' ').map((name) => [name, null]));

export const libraryChartOptions: Record<
    string,
    Record<string, string | null>
> = {
    heatmap: {
        ...sinceFirstBinding(
            'colorScheme reverseScheme cellGap showLegend labelSpacing',
        ),
        xTitle: '0.5.0',
        yTitle: '0.5.0',
        legendTitle: '0.5.0',
        legendFormat: '0.5.0',
        // Caps the colour range at a percentile of the cells, so one extreme cell does not leave
        // every other cell the same pale tint
        colorClampPercentile: '0.5.1',
        colorScale: '0.5.1',
    },
    'vega-trellis': {
        ...sinceFirstBinding(
            'arrangement columns minPanelHeight sharedY markType curve fillOpacity showLine showPoints syncedHover xLabelAngle',
        ),
        showPeakLabel: '0.7.0',
        zeroFillGaps: '0.7.0',
    },
    'sortable-pivot-table': {
        ...sinceFirstBinding(
            'showTotalsRow groupSubtotals defaultCollapsed valueDisplay showRowTotals totalsPosition stickyFirstColumn resizableColumns stripedRows stickyHeader fitMode columnBorders columnGroupBy hideColumns density cellColorMode formatTotals showMiniBars decimalPlaces rowOrder columnOrder defaultSortDirection highlightColor',
        ),
        initialSort: '0.14.0',
        rowHeaderName: '0.14.0',
        valueNames: '0.14.0',
        // Writes each value the way its field is formatted, so a share reads 42%
        useFieldFormats: '0.14.2',
    },
    'customizable-cartesian-chart': {
        ...sinceFirstBinding(
            'seriesType m2Type m3Type m4Type m1LineStyle m2LineStyle m3LineStyle m4LineStyle stack splitOtherAgg splitTopN layout panelArrangement panelColumns sharedY maxPanels smooth showSymbols symbolSize lineWidth areaOpacity barBorderRadius lightdashLabels showDataLabels dataLabelPoints stackTotalLabels showBand bandPercent bandOpacity xAxisType xTimeFormat xTimeFormatCustom xCustomOrder yAxisType yMin yMax yRange percentZeroBaseline yInverse dualAxis m2Right m3Right farRightAxisMetric m4Right showAxisTitles xName yName yRightName axisLabelFontSize xLabelAutoRotate xLabelRotate showSplitLines xBoundaryGap markLineType markLineValue markLineFormula markLineStyle markLineWidth markLineMetric markLineFrom markLineTo markLineLabel markLineOpacity markLineBehind trendLine markMaxMin markAreaFrom markAreaTo shadeFuture title showLegend legendPosition showTooltip tooltipStackPercent tooltipTrigger dataZoom showToolbox animation',
        ),
        m1Name: '0.18.0',
        m2Name: '0.18.0',
        m3Name: '0.18.0',
        m4Name: '0.18.0',
        // Orders the split series: 'total' puts the largest at the bottom of the stack. Added in 0.18.1;
        // from 0.18.3 the colours follow the sorted order too, which is the version a binding asks for
        splitSort: '0.18.3',
        // Colours series or bars by a named group, such as the provider of a model
        splitColorGroups: '0.18.4',
        orientation: '0.18.4',
        // A colour for one measure, for measures that mean good or not good. Ignored with a split.
        m1Color: '0.18.6',
        m2Color: '0.18.6',
        m3Color: '0.18.6',
        m4Color: '0.18.6',
        // Whole-number ticks, for an axis that counts a few things
        yIntegerTicks: '0.18.6',
        y2IntegerTicks: '0.18.6',
        // Shades each group's series by a ranked list of words in their names, darkest first
        splitShadeRank: '0.18.7',
        // 'groups' lists one legend entry for each colour group instead of one for each series
        legendMode: '0.18.7',
    },
    'big-number-with-sparkline-trend': {
        ...sinceFirstBinding(
            'valueAggregation label showLabel style bigNumberSize alignment sizeMode customValueSize longTextHandling valuePrefix valueSuffix valueColor fontFamily valueFontWeight letterSpacing labelSize labelColor labelTransform backgroundMode backgroundColor backgroundColor2 gradientDirection autoContrastText showCardBorder cardBorderColor cardBorderRadius showCardShadow cardPadding contentGap outerMargin verticalAlign secondaryLabel secondarySize secondaryColor showComparison comparisonFormat comparisonLabel flipColors positiveColor negativeColor comparisonDecimals showComparisonArrow comparisonSize comparison2Label comparison2Format comparison3Label comparison3Format targetDisplay targetLabel progressColor rule1Operator rule1Threshold rule1Color rule1Apply rule2Operator rule2Threshold rule2Color rule2Apply colorSparklineByTrend sparklineColor showSparklineArea sparklineStrokeWidth sparklineLength sparklinePosition sparklineCurve sparklineHeight',
        ),
        showHighLow: '0.8.0',
        comparisonSource: '0.8.0',
        // From this version the number's size and format no longer depend on how the value is
        // added up, so cards in a row can match
        reserveComparisonSpace: '0.8.2',
    },
    'word-cloud': {
        ...sinceFirstBinding(
            'colorMode singleColor rotationMode spiral minFontSize maxFontSize sizeScale maxWords caseMode showLegend',
        ),
        // Hides the line under the cloud that counts its words
        showCaption: '0.4.1',
    },
};

// Swaps a chart to its library type only when the installed version meets its binding and the binding is valid.
export const withLibraryCharts = (
    charts: ChartAsCode[],
    bindings: ReadonlyMap<string, LibraryChartBinding>,
    usableTypes: ReadonlyMap<string, UsableLibraryChartType>, // keyed by registry slug
): { charts: ChartAsCode[]; rejected: RejectedLibraryChart[] } => {
    const rejected: RejectedLibraryChart[] = [];
    const swapped = charts.map((chart): ChartAsCode => {
        const binding = bindings.get(chart.slug);
        const type = binding && usableTypes.get(binding.slug);
        if (!binding || !type) return chart;
        if (!meetsMinVersion(type.registryVersion, binding.minVersion)) {
            rejected.push({
                chartSlug: chart.slug,
                typeSlug: binding.slug,
                reason: 'version',
                errors: [
                    `needs ${binding.minVersion}, installed ${type.registryVersion}`,
                ],
            });
            return chart;
        }
        const { query } = binding;
        const errors = getDataAppVizChartConfigErrors(
            {
                fieldMapping: binding.fieldMapping,
                optionValues: binding.optionValues,
            },
            type.vizSchema,
            query
                ? {
                      dimensions: query.dimensions,
                      metrics: query.metrics,
                      tableCalculations: (query.tableCalculations ?? []).map(
                          ({ name }) => name,
                      ),
                  }
                : {
                      dimensions: chart.metricQuery.dimensions,
                      metrics: chart.metricQuery.metrics,
                      tableCalculations: (
                          chart.metricQuery.tableCalculations ?? []
                      ).map(({ name }) => name),
                  },
        );
        if (errors.length > 0) {
            rejected.push({
                chartSlug: chart.slug,
                typeSlug: binding.slug,
                reason: 'schema',
                errors,
            });
            return chart;
        }
        return {
            ...chart,
            ...(query && {
                description: query.description,
                metricQuery: {
                    ...chart.metricQuery,
                    dimensions: query.dimensions,
                    metrics: query.metrics,
                    sorts: query.sorts,
                    limit: query.limit,
                    // The plain chart's calculations may reference fields the override drops.
                    tableCalculations: query.tableCalculations ?? [],
                },
                tableConfig: {
                    columnOrder: [
                        ...query.dimensions,
                        ...query.metrics,
                        ...(query.tableCalculations ?? []).map(
                            ({ name }) => name,
                        ),
                    ],
                },
            }),
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizSlug: type.appSlug,
                    fieldMapping: binding.fieldMapping,
                    optionValues: binding.optionValues,
                },
            },
        };
    });
    return { charts: swapped, rejected };
};
