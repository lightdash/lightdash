import assertUnreachable from '../utils/assertUnreachable';
import { type ViewStatistics } from './analytics';
import { type DateZoom } from './api/paginatedQuery';
import { type ConditionalFormattingConfig } from './conditionalFormatting';
import { type ChartSourceType } from './content';
import { type CompactOrAlias, type FieldId } from './field';
import { type KnexPaginatedData } from './knex-paginate';
import { type MetricQuery, type MetricQueryRequest } from './metricQuery';
import { type ParametersValuesMap } from './parameters';
import type { SchedulerAndTargets } from './scheduler';
// eslint-disable-next-line import/no-cycle
import { type SpaceAccess } from './space';
import { type LightdashUser, type UpdatedByUser } from './user';
import { type ValidationSummary } from './validation';

export enum ChartKind {
    LINE = 'line',
    HORIZONTAL_BAR = 'horizontal_bar',
    VERTICAL_BAR = 'vertical_bar',
    SCATTER = 'scatter',
    AREA = 'area',
    MIXED = 'mixed',
    PIE = 'pie',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
    FUNNEL = 'funnel',
    CUSTOM = 'custom',
    TREEMAP = 'treemap',
    GAUGE = 'gauge',
    MAP = 'map',
}

export enum ChartType {
    CARTESIAN = 'cartesian',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
    PIE = 'pie',
    FUNNEL = 'funnel',
    TREEMAP = 'treemap',
    GAUGE = 'gauge',
    CUSTOM = 'custom',
    MAP = 'map',
}

export enum ComparisonFormatTypes {
    RAW = 'raw',
    PERCENTAGE = 'percentage',
}

export enum ComparisonDiffTypes {
    POSITIVE = 'positive',
    NEGATIVE = 'negative',
    NONE = 'none',
    NAN = 'NaN',
    UNDEFINED = 'undefined',
}

export type BigNumber = {
    /** Custom label for the big number */
    label?: string;
    /** Number formatting style (compact notation) */
    style?: CompactOrAlias;
    /** Field ID to display as the big number */
    selectedField?: string;
    /** Show the label above the number */
    showBigNumberLabel?: boolean;
    /** Include table name in the label */
    showTableNamesInLabel?: boolean;
    /** Show comparison with previous value */
    showComparison?: boolean;
    /** Format for comparison value */
    comparisonFormat?: ComparisonFormatTypes;
    /** Flip positive/negative colors (red for increase, green for decrease) */
    flipColors?: boolean;
    /** Custom label for the comparison value */
    comparisonLabel?: string;
    /** Conditional formatting rules */
    conditionalFormattings?: ConditionalFormattingConfig[];
    comparisonField?: string;
};

export const PieChartValueLabels = {
    hidden: 'Hidden',
    inside: 'Inside',
    outside: 'Outside',
} as const;

export type PieChartValueLabel = keyof typeof PieChartValueLabels;

export type PieChartValueOptions = {
    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;
};

export const PieChartLegendPositions = {
    horizontal: 'Horizontal',
    vertical: 'Vertical',
} as const;

export type PieChartLegendPosition = keyof typeof PieChartLegendPositions;
export const PieChartLegendPositionDefault = Object.keys(
    PieChartLegendPositions,
)[0] as PieChartLegendPosition;
export const PieChartLegendLabelMaxLengthDefault = 30;
export const PieChartTooltipLabelMaxLength = 40;

export type SeriesMetadata = {
    /** Color for the series */
    color: string;
};
export type PieChart = {
    /** Field IDs used for grouping/slicing the pie */
    groupFieldIds?: string[];
    /** Field ID of the metric to display */
    metricId?: string;
    /** Display as donut chart with hole in center */
    isDonut?: boolean;
    /** Position of value labels on slices */
    valueLabel?: PieChartValueOptions['valueLabel'];
    /** Show the actual value on slices */
    showValue?: PieChartValueOptions['showValue'];
    /** Show percentage on slices */
    showPercentage?: PieChartValueOptions['showPercentage'];
    /** Custom labels for each group/slice */
    groupLabelOverrides?: Record<string, string>;
    /** Custom colors for each group/slice */
    groupColorOverrides?: Record<string, string>;
    /** Per-slice value display options */
    groupValueOptionOverrides?: Record<string, Partial<PieChartValueOptions>>;
    /** Custom sort order for groups/slices */
    groupSortOverrides?: string[];
    /** Show the chart legend */
    showLegend?: boolean;
    /** Legend position/orientation */
    legendPosition?: PieChartLegendPosition;
    /** Maximum character length for legend items */
    legendMaxItemLength?: number;
    /** Metadata for series (colors, etc.) */
    metadata?: Record<string, SeriesMetadata>;
};

export type TreemapChart = {
    /** Minimum size for visible nodes */
    visibleMin?: number;
    /** Depth of leaf nodes to display */
    leafDepth?: number;
    /** Field IDs for hierarchical grouping */
    groupFieldIds?: string[];
    /** Field ID for node size */
    sizeMetricId?: string;
    /** Field ID for node color value */
    colorMetricId?: string;
    /** Start color for color gradient (hex code) */
    startColor?: string;
    /** End color for color gradient (hex code) */
    endColor?: string;
    /** Use dynamic color scaling based on values */
    useDynamicColors?: boolean;
    /** Value threshold for start color */
    startColorThreshold?: number;
    /** Value threshold for end color */
    endColorThreshold?: number;
};

export type GaugeSection = {
    /** Start value for this section */
    min: number;
    /** End value for this section */
    max: number;
    /** Field ID to use as min value */
    minFieldId?: string;
    /** Field ID to use as max value */
    maxFieldId?: string;
    /** Color for this section (hex code) */
    color: string;
};

export type GaugeChart = {
    /** Field ID for the gauge value */
    selectedField?: string;
    /** Minimum value for the gauge */
    min?: number;
    /** Maximum value for the gauge */
    max?: number;
    /** Field ID to use as the max value */
    maxFieldId?: string;
    /** Show min/max labels on the gauge */
    showAxisLabels?: boolean;
    /** Color sections/ranges for the gauge */
    sections?: GaugeSection[];
    /** Custom label for the gauge value */
    customLabel?: string;
    /** Show value as percentage */
    showPercentage?: boolean;
    /** Custom label for the percentage display */
    customPercentageLabel?: string;
};

export enum MapChartLocation {
    USA = 'USA',
    WORLD = 'world',
    EUROPE = 'europe',
    CUSTOM = 'custom',
}

export enum MapChartType {
    SCATTER = 'scatter',
    AREA = 'area',
    HEATMAP = 'heatmap',
}

export enum MapTileBackground {
    NONE = 'none',
    OPENSTREETMAP = 'openstreetmap',
    LIGHT = 'light',
    DARK = 'dark',
    SATELLITE = 'satellite',
}

export type MapFieldConfig = {
    /** Whether to show this field in tooltips */
    visible?: boolean;
    /** Custom label for the field */
    label?: string;
};

export type MapChart = {
    /** Type of map to display */
    mapType?: MapChartLocation;
    /** URL to custom GeoJSON file */
    customGeoJsonUrl?: string;
    /** How to display location data */
    locationType?: MapChartType;
    /** Field ID for latitude values */
    latitudeFieldId?: string;
    /** Field ID for longitude values */
    longitudeFieldId?: string;
    /** Field ID for location/region names (area maps) */
    locationFieldId?: string;
    /** Property key in GeoJSON to match against data */
    geoJsonPropertyKey?: string;
    /** Field ID for the value to display */
    valueFieldId?: string;
    /** Show the map legend */
    showLegend?: boolean;
    /** Array of colors for the value gradient */
    colorRange?: string[];
    /** Per-value color overrides for categorical color fields */
    colorOverrides?: Record<string, string>;
    /** Default zoom level */
    defaultZoom?: number;
    /** Default center latitude */
    defaultCenterLat?: number;
    /** Default center longitude */
    defaultCenterLon?: number;
    /** Minimum bubble size for scatter maps */
    minBubbleSize?: number;
    /** Maximum bubble size for scatter maps */
    maxBubbleSize?: number;
    /** Field ID for bubble size (scatter maps) */
    sizeFieldId?: string;
    /** Configuration for heatmap visualization */
    heatmapConfig?: {
        /** Radius of heat points */
        radius?: number;
        /** Blur amount for heat points */
        blur?: number;
        /** Opacity of the heatmap layer */
        opacity?: number;
    };
    /** Data layer opacity (0.1 to 1) */
    dataLayerOpacity?: number;
    /** Map tile background style */
    tileBackground?: MapTileBackground;
    /** Background color for the map (hex code) */
    backgroundColor?: string;
    /** Color for regions with no data (hex code) */
    noDataColor?: string;
    /** Field-specific configuration for tooltips */
    fieldConfig?: Record<string, MapFieldConfig>;
    /** Save the current map zoom/position */
    saveMapExtent?: boolean;
};

export enum FunnelChartDataInput {
    ROW = 'row',
    COLUMN = 'column',
}

export enum FunnelChartLabelPosition {
    INSIDE = 'inside',
    LEFT = 'left',
    RIGHT = 'right',
    HIDDEN = 'hidden',
}

export enum FunnelChartLegendPosition {
    HORIZONTAL = 'horizontal',
    VERTICAL = 'vertical',
}

export type FunnelChart = {
    /** How data is structured (row-based or column-based) */
    dataInput?: FunnelChartDataInput;
    /** Field ID to display in funnel */
    fieldId?: string;
    /** Metadata for series (colors, etc.) */
    metadata?: Record<string, SeriesMetadata>;
    /** Custom labels for funnel stages */
    labelOverrides?: Record<string, string>;
    /** Custom colors for funnel stages */
    colorOverrides?: Record<string, string>;
    /** Label display configuration */
    labels?: {
        /** Position of labels */
        position?: FunnelChartLabelPosition;
        /** Show the actual value */
        showValue?: boolean;
        /** Show percentage */
        showPercentage?: boolean;
    };
    /** Show the chart legend */
    showLegend?: boolean;
    /** Legend orientation */
    legendPosition?: FunnelChartLegendPosition;
};

export type ColumnProperties = {
    /** Whether the column is visible */
    visible?: boolean;
    /** Custom display name for the column */
    name?: string;
    /** Freeze the column (stick to left side) */
    frozen?: boolean;
    /** How to display the cell value */
    displayStyle?: 'text' | 'bar';
    /** Color for bar display style (hex code) */
    color?: string;
    width?: number;
};

export type TableChart = {
    /** Show column totals/calculations */
    showColumnCalculation?: boolean;
    /** Show row totals/calculations */
    showRowCalculation?: boolean;
    /** Show table names in column headers */
    showTableNames?: boolean;
    /** Hide row number column */
    hideRowNumbers?: boolean;
    /** Enable drag-to-resize columns */
    enableColumnResize?: boolean;
    /** Wrap column titles in header cells */
    wrapColumnTitles?: boolean;
    /** Show total results count */
    showResultsTotal?: boolean;
    /** Show subtotal rows */
    showSubtotals?: boolean;
    /** Column-specific configuration */
    columns?: Record<string, ColumnProperties>;
    /** Conditional formatting rules */
    conditionalFormattings?: ConditionalFormattingConfig[];
    /** Display metrics as rows instead of columns */
    metricsAsRows?: boolean;
};

export enum CartesianSeriesType {
    LINE = 'line',
    BAR = 'bar',
    SCATTER = 'scatter',
    AREA = 'area',
}

export type PivotValue = {
    /** Pivot field ID */
    field: string;
    /** Pivot value */
    value: unknown;
};

export type PivotReference = {
    /** Field ID being referenced */
    field: string;
    /** Pivot values for this reference (for pivoted data) */
    pivotValues?: PivotValue[];
};

export const isPivotReferenceWithValues = (
    value: PivotReference,
): value is Required<PivotReference> =>
    !!value.pivotValues && value.pivotValues.length > 0;

export type MarkLineData = {
    /** Y axis value for horizontal line */
    yAxis?: string;
    /** X axis value for vertical line */
    xAxis?: string;
    /** Name of the reference line */
    name?: string;
    /** Value to display */
    value?: string;
    /** Point type (e.g., 'average') */
    type?: string;
    /** Unique identifier for this mark line */
    uuid: string;
    /** Line style for this data point */
    lineStyle?: {
        /** Line color */
        color: string;
    };
    /** Label configuration for this data point */
    label?: {
        /** Label formatter */
        formatter?: string;
        /** Label position */
        position?: 'start' | 'middle' | 'end';
    };
    /** Dynamic value type */
    dynamicValue?: 'average';
};
export type MarkLine = {
    /** Reference line data points */
    data: MarkLineData[];
    /** Symbol at line endpoints */
    symbol?: string;
    /** Line style configuration */
    lineStyle?: {
        /** Line color */
        color: string;
        /** Line width */
        width: number;
        /** Line type */
        type: string;
    };
    /** Label configuration */
    label?: {
        /** Label formatter */
        formatter?: string;
    };
};
export type Series = {
    /** Field references for this series */
    encode: {
        /** X axis field reference */
        xRef: PivotReference;
        /** Y axis field reference */
        yRef: PivotReference;
        /** Hash of xRef (computed) */
        x?: string;
        /** Hash of yRef (computed) */
        y?: string;
    };
    /** Series visualization type */
    type: CartesianSeriesType;
    /** Stack group name (series with same stack name are stacked) */
    stack?: string;
    /** Stack total label configuration */
    stackLabel?: {
        /** Show stack total labels */
        show?: boolean;
    };
    /** Display name for the series */
    name?: string;
    /** Color for the series (hex code) */
    color?: string;
    /** Index of Y axis to use (for dual Y axis charts) */
    yAxisIndex?: number;
    /** Data label configuration */
    label?: {
        /** Show data labels on points */
        show?: boolean;
        /** Position of data labels */
        position?: 'left' | 'top' | 'right' | 'bottom' | 'inside';
        /** Show labels even when they overlap */
        showOverlappingLabels?: boolean;
        /** Show the metric value */
        showValue?: boolean;
        /** Show the legend/pivot name */
        showLabel?: boolean;
        /** Show the metric field name */
        showSeriesName?: boolean;
    };
    /** Hide this series from the chart */
    hidden?: boolean;
    /** Area fill style (presence indicates area chart) */
    areaStyle?: Record<string, unknown>;
    /** Show symbols/markers on data points */
    showSymbol?: boolean;
    /** Use smooth curves for line/area charts */
    smooth?: boolean;
    /** Reference line configuration */
    markLine?: MarkLine;
    /** Whether this series is currently filtered out */
    isFilteredOut?: boolean;
};

export type EchartsLegend = {
    /** Show the legend */
    show?: boolean;
    /** Legend type (plain or scrollable) */
    type?: 'plain' | 'scroll';
    /** Legend orientation */
    orient?: 'horizontal' | 'vertical';
    /** Top position */
    top?: string;
    /** Right position */
    right?: string;
    /** Bottom position */
    bottom?: string;
    /** Left position */
    left?: string;
    /** Legend width */
    width?: string;
    /** Legend height */
    height?: string;
    /** Legend alignment */
    align?: 'auto' | 'left' | 'right';
    /** Legend icon shape */
    icon?:
        | 'circle'
        | 'rect'
        | 'roundRect'
        | 'triangle'
        | 'diamond'
        | 'pin'
        | 'arrow'
        | 'none';
};

export type EchartsGrid = {
    /** Whether the grid area contains axis labels */
    containLabel?: boolean;
    /** Top padding */
    top?: string;
    /** Right padding */
    right?: string;
    /** Bottom padding */
    bottom?: string;
    /** Left padding */
    left?: string;
    /** Grid width */
    width?: string;
    /** Grid height */
    height?: string;
};

export const TooltipSortByOptions = {
    DEFAULT: 'default',
    ALPHABETICAL: 'alphabetical',
    VALUE_ASCENDING: 'value_ascending',
    VALUE_DESCENDING: 'value_descending',
} as const;

export type TooltipSortBy =
    (typeof TooltipSortByOptions)[keyof typeof TooltipSortByOptions];

export type CompleteEChartsConfig = {
    /** Legend configuration */
    legend?: EchartsLegend;
    /** Grid (chart area) configuration */
    grid?: EchartsGrid;
    /** Chart series configuration */
    series: Series[];
    /** X axis configuration */
    xAxis: XAxis[];
    /** Y axis configuration */
    yAxis: Axis[];
    /** Tooltip formatter template */
    tooltip?: string;
    /** How to sort tooltip items */
    tooltipSort?: TooltipSortBy;
    /** Show tick marks on axes */
    showAxisTicks?: boolean;
    /** Font size for axis labels */
    axisLabelFontSize?: number;
    /** Font size for axis titles */
    axisTitleFontSize?: number;
};

export type EChartsConfig = Partial<CompleteEChartsConfig>;

type Axis = {
    /** Axis title */
    name?: string;
    /** Minimum value (or 'dataMin' for auto) */
    min?: string | undefined;
    /** Maximum value (or 'dataMax' for auto) */
    max?: string | undefined;
    /** Offset from minimum value */
    minOffset?: string | undefined;
    /** Offset from maximum value */
    maxOffset?: string | undefined;
    /** Reverse the axis direction */
    inverse?: boolean;
    /** Rotation angle for axis labels */
    rotate?: number;
};

export type XAxis = Axis & {
    /** How to sort the X axis */
    sortType?: XAxisSortType;
    /** Enable data zoom slider for this axis */
    enableDataZoom?: boolean;
};

export enum XAxisSortType {
    DEFAULT = 'default',
    CATEGORY = 'category',
    BAR_TOTALS = 'bar_totals',
}

export enum XAxisSort {
    DEFAULT = 'default',
    DEFAULT_REVERSED = 'default_reversed',
    ASCENDING = 'ascending',
    DESCENDING = 'descending',
    BAR_TOTALS_ASCENDING = 'bar_totals_ascending',
    BAR_TOTALS_DESCENDING = 'bar_totals_descending',
}

export function getXAxisSort(
    xAxis: Pick<XAxis, 'sortType' | 'inverse'> | undefined,
): XAxisSort {
    if (!xAxis) return XAxisSort.DEFAULT;

    switch (xAxis.sortType) {
        case XAxisSortType.CATEGORY:
            return xAxis.inverse ? XAxisSort.DESCENDING : XAxisSort.ASCENDING;
        case XAxisSortType.BAR_TOTALS:
            return xAxis.inverse
                ? XAxisSort.BAR_TOTALS_DESCENDING
                : XAxisSort.BAR_TOTALS_ASCENDING;
        case XAxisSortType.DEFAULT:
        default:
            return xAxis.inverse
                ? XAxisSort.DEFAULT_REVERSED
                : XAxisSort.DEFAULT;
    }
}

export type CompleteCartesianChartLayout = {
    /** Field ID to use for the X axis */
    xField: string;
    /** Field IDs to use for the Y axis */
    yField: string[];
    /** Swap X and Y axes (creates horizontal bar charts) */
    flipAxes?: boolean | undefined;
    /** Show vertical grid lines */
    showGridX?: boolean | undefined;
    /** Show horizontal grid lines */
    showGridY?: boolean | undefined;
    /** Show the X axis */
    showXAxis?: boolean | undefined;
    /** Show the Y axis */
    showYAxis?: boolean | undefined;
    /** Controls left/primary Y-axis visibility */
    showLeftYAxis?: boolean | undefined;
    /** Controls right/secondary Y-axis visibility */
    showRightYAxis?: boolean | undefined;
    /** Stack series together (true for default stacking, or string for stack group name) */
    stack?: boolean | string | undefined;
    /** Connect null data points with a line */
    connectNulls?: boolean | undefined;
};

export type CartesianChartLayout = Partial<CompleteCartesianChartLayout>;

export type CustomVis = {
    /** Custom visualization specification (Vega-Lite or other) */
    spec?: Record<string, unknown>;
};

export type CartesianChart = {
    /** Layout configuration for the chart axes and orientation */
    layout: CartesianChartLayout;
    /** ECharts-specific configuration */
    eChartsConfig: EChartsConfig;
    /** Metadata for series (colors, etc.) */
    metadata?: Record<string, SeriesMetadata>;
};

export type BigNumberConfig = {
    /** Type of chart visualization */
    type: ChartType.BIG_NUMBER;
    /** Chart-type-specific configuration */
    config?: BigNumber;
};

export type CartesianChartConfig = {
    /** Type of chart visualization */
    type: ChartType.CARTESIAN;
    /** Chart-type-specific configuration */
    config?: CartesianChart;
};

export type CustomVisConfig = {
    /** Type of chart visualization */
    type: ChartType.CUSTOM;
    /** Chart-type-specific configuration */
    config?: CustomVis;
};

export type PieChartConfig = {
    /** Type of chart visualization */
    type: ChartType.PIE;
    /** Chart-type-specific configuration */
    config?: PieChart;
};

export type FunnelChartConfig = {
    /** Type of chart visualization */
    type: ChartType.FUNNEL;
    /** Chart-type-specific configuration */
    config?: FunnelChart;
};

export type TableChartConfig = {
    /** Type of chart visualization */
    type: ChartType.TABLE;
    /** Chart-type-specific configuration */
    config?: TableChart;
};

export type TreemapChartConfig = {
    /** Type of chart visualization */
    type: ChartType.TREEMAP;
    /** Chart-type-specific configuration */
    config?: TreemapChart;
};

export type GaugeChartConfig = {
    /** Type of chart visualization */
    type: ChartType.GAUGE;
    /** Chart-type-specific configuration */
    config?: GaugeChart;
};

export type MapChartConfig = {
    /** Type of chart visualization */
    type: ChartType.MAP;
    /** Chart-type-specific configuration */
    config?: MapChart;
};

export type ChartConfig =
    | BigNumberConfig
    | CartesianChartConfig
    | CustomVisConfig
    | PieChartConfig
    | FunnelChartConfig
    | TableChartConfig
    | TreemapChartConfig
    | GaugeChartConfig
    | MapChartConfig;

export type SavedChartType = ChartType;

export type SavedChartDAO = Omit<SavedChart, 'isPrivate' | 'access'>;

export type SavedChart = {
    uuid: string;
    projectUuid: string;
    /** Display name of the chart */
    name: string;
    /** Optional description of what this chart displays */
    description?: string;
    /** The explore/table name this chart queries from */
    tableName: string;
    /** The query configuration defining what data to fetch */
    metricQuery: MetricQuery;
    /** Pivot table configuration */
    pivotConfig?: {
        /** Fields to use as pivot columns */
        columns: string[];
    };
    /** Visualization configuration for the chart */
    chartConfig: ChartConfig;
    /** Table view configuration */
    tableConfig: {
        /** Order of columns in table view */
        columnOrder: string[];
    };
    /** Parameter values for the chart query */
    parameters?: ParametersValuesMap;
    /** Timestamp when the chart was last updated */
    updatedAt: Date;
    updatedByUser?: UpdatedByUser;
    organizationUuid: string;
    spaceUuid: string;
    spaceName: string;
    pinnedListUuid: string | null;
    pinnedListOrder: number | null;
    dashboardUuid: string | null;
    dashboardName: string | null;
    colorPalette: string[];
    isPrivate: boolean;
    access: SpaceAccess[];
    /** Unique identifier slug for this chart */
    slug: string;
    deletedAt?: Date;
    deletedBy?: {
        userUuid: string;
        firstName: string;
        lastName: string;
    } | null;
};

type CreateChartBase = Pick<
    SavedChart,
    | 'name'
    | 'description'
    | 'tableName'
    | 'metricQuery'
    | 'pivotConfig'
    | 'chartConfig'
    | 'tableConfig'
    | 'parameters'
>;

export type CreateChartInSpace = CreateChartBase & {
    spaceUuid?: string;
    dashboardUuid?: null;
};

export type CreateChartInDashboard = CreateChartBase & {
    dashboardUuid: string;
    spaceUuid?: null;
};

export type CreateSavedChart = CreateChartInSpace | CreateChartInDashboard;

export type CreateSavedChartVersion = Omit<
    SavedChart,
    | 'uuid'
    | 'name'
    | 'updatedAt'
    | 'projectUuid'
    | 'organizationUuid'
    | 'spaceUuid'
    | 'spaceName'
    | 'pinnedListUuid'
    | 'pinnedListOrder'
    | 'views'
    | 'firstViewedAt'
    | 'dashboardUuid'
    | 'dashboardName'
    | 'colorPalette'
    | 'isPrivate'
    | 'access'
    | 'slug'
> &
    // For Charts created within a dashboard
    Partial<Pick<SavedChart, 'dashboardUuid' | 'dashboardName'>>;

export type UpdateSavedChart = Partial<
    Pick<SavedChart, 'name' | 'description' | 'spaceUuid'>
>;

export type UpdateMultipleSavedChart = Pick<
    SavedChart,
    'uuid' | 'name' | 'description' | 'spaceUuid'
>;

export const isCompleteLayout = (
    value: CartesianChartLayout | undefined,
): value is CompleteCartesianChartLayout =>
    !!value && !!value.xField && !!value.yField && value.yField.length > 0;

export const isCompleteEchartsConfig = (
    value: EChartsConfig | undefined,
): value is CompleteEChartsConfig =>
    !!value && !!value.series && value.series.length > 0;

export const isCartesianChartConfig = (
    value: ChartConfig['config'],
): value is CartesianChart =>
    !!value && 'layout' in value && 'eChartsConfig' in value;

export const isBigNumberConfig = (
    value: ChartConfig['config'],
): value is BigNumber => !!value && !isCartesianChartConfig(value);

export const isTableChartConfig = (
    value: ChartConfig['config'],
): value is TableChart => !!value && !isCartesianChartConfig(value);

export const isPieChartConfig = (
    value: ChartConfig['config'],
): value is PieChart => !!value && 'isDonut' in value;

export const getCustomLabelsFromColumnProperties = (
    columns: Record<string, ColumnProperties> | undefined,
): Record<string, string> | undefined =>
    columns
        ? Object.entries(columns).reduce(
              (acc, [key, value]) =>
                  value.name
                      ? {
                            ...acc,
                            [key]: value.name,
                        }
                      : acc,
              {},
          )
        : undefined;

export const getCustomLabelsFromTableConfig = (
    config: ChartConfig['config'] | undefined,
): Record<string, string> | undefined =>
    config && isTableChartConfig(config)
        ? getCustomLabelsFromColumnProperties(config.columns)
        : undefined;

export const hashFieldReference = (reference: PivotReference) =>
    reference.pivotValues
        ? `${reference.field}.${reference.pivotValues
              .map(({ field, value }) => `${field}.${value}`)
              .join('.')}`
        : reference.field;

export const getSeriesId = (series: Series) =>
    `${hashFieldReference(series.encode.xRef)}|${hashFieldReference(
        series.encode.yRef,
    )}`;

export const ECHARTS_DEFAULT_COLORS = [
    '#5470c6',
    '#fc8452',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#9a60b4',
    '#ea7ccc',
];

export const getDefaultSeriesColor = (index: number) =>
    ECHARTS_DEFAULT_COLORS[index % ECHARTS_DEFAULT_COLORS.length];

export const isSeriesWithMixedChartTypes = (
    series: Series[] | undefined,
): boolean =>
    new Set(
        series?.map(
            ({ type, areaStyle }) =>
                `${type}${
                    type === CartesianSeriesType.LINE ? areaStyle : undefined
                }`,
        ),
    ).size >= 2;

export const getChartType = (chartKind: ChartKind | undefined): ChartType => {
    if (chartKind === undefined) return ChartType.CARTESIAN;
    switch (chartKind) {
        case ChartKind.PIE:
            return ChartType.PIE;
        case ChartKind.FUNNEL:
            return ChartType.FUNNEL;
        case ChartKind.BIG_NUMBER:
            return ChartType.BIG_NUMBER;
        case ChartKind.TABLE:
            return ChartType.TABLE;
        case ChartKind.TREEMAP:
            return ChartType.TREEMAP;
        case ChartKind.GAUGE:
            return ChartType.GAUGE;
        default:
            return ChartType.CARTESIAN;
    }
};
export const getChartKind = (
    chartType: ChartType,
    value: ChartConfig['config'],
): ChartKind | undefined => {
    switch (chartType) {
        case ChartType.PIE:
            return ChartKind.PIE;
        case ChartType.FUNNEL:
            return ChartKind.FUNNEL;
        case ChartType.BIG_NUMBER:
            return ChartKind.BIG_NUMBER;
        case ChartType.TABLE:
            return ChartKind.TABLE;
        case ChartType.CUSTOM:
            return ChartKind.CUSTOM;
        case ChartType.CARTESIAN:
            if (isCartesianChartConfig(value)) {
                const { series } = value.eChartsConfig;

                if (isSeriesWithMixedChartTypes(series)) {
                    return ChartKind.MIXED;
                }

                const type = series?.[0]?.type;
                if (!type) return undefined;

                switch (type) {
                    case CartesianSeriesType.AREA:
                        return ChartKind.AREA;
                    case CartesianSeriesType.BAR:
                        return value.layout.flipAxes
                            ? ChartKind.HORIZONTAL_BAR
                            : ChartKind.VERTICAL_BAR;
                    case CartesianSeriesType.LINE:
                        return series?.[0]?.areaStyle
                            ? ChartKind.AREA
                            : ChartKind.LINE;
                    case CartesianSeriesType.SCATTER:
                        return ChartKind.SCATTER;
                    default:
                        return assertUnreachable(
                            type,
                            `Unknown cartesian series type: ${type}`,
                        );
                }
            }

            return undefined;
        case ChartType.TREEMAP:
            return ChartKind.TREEMAP;
        case ChartType.GAUGE:
            return ChartKind.GAUGE;
        case ChartType.MAP:
            return ChartKind.MAP;
        default:
            return assertUnreachable(
                chartType,
                `Unknown chart type: ${chartType}`,
            );
    }
};

export const getEChartsChartTypeFromChartKind = (
    chartKind: ChartKind,
): CartesianSeriesType => {
    switch (chartKind) {
        case ChartKind.VERTICAL_BAR:
            return CartesianSeriesType.BAR;
        case ChartKind.LINE:
            return CartesianSeriesType.LINE;
        case ChartKind.AREA:
            return CartesianSeriesType.AREA;
        case ChartKind.SCATTER:
            return CartesianSeriesType.SCATTER;
        default:
            return CartesianSeriesType.BAR;
    }
};

export type ChartSummary = Pick<
    SavedChart,
    | 'uuid'
    | 'name'
    | 'description'
    | 'spaceName'
    | 'spaceUuid'
    | 'projectUuid'
    | 'organizationUuid'
    | 'pinnedListUuid'
    | 'dashboardUuid'
    | 'dashboardName'
    | 'slug'
> & {
    chartType?: ChartType | undefined;
    chartKind?: ChartKind | undefined;
    source?: ChartSourceType;
};

export type SpaceQuery = ChartSummary &
    Pick<SavedChart, 'updatedAt' | 'updatedByUser' | 'pinnedListOrder'> &
    ViewStatistics & {
        validationErrors?: ValidationSummary[];
    };

export type ApiChartSummaryListResponse = {
    status: 'ok';
    results: ChartSummary[];
};

export type ApiChartListResponse = {
    status: 'ok';
    results: SpaceQuery[];
};

export type ChartHistory = {
    history: ChartVersionSummary[];
};

export type ChartVersion = {
    chartUuid: string;
    versionUuid: string;
    createdAt: Date;
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
    chart: SavedChart;
};

export type ChartVersionSummary = Pick<
    ChartVersion,
    'chartUuid' | 'versionUuid' | 'createdAt' | 'createdBy'
>;

export type ApiGetChartHistoryResponse = {
    status: 'ok';
    results: ChartHistory;
};
export type ApiGetChartVersionResponse = {
    status: 'ok';
    results: ChartVersion;
};

export const getHiddenTableFields = (config: ChartConfig) => {
    // get hidden fields from chart config

    if (config.type === 'table' && config.config?.columns) {
        return Object.entries(config.config?.columns).reduce<string[]>(
            (acc, [col, props]) => {
                if (props.visible === false) return [...acc, col];
                return acc;
            },
            [],
        );
    }

    return [];
};

export type CalculateTotalFromQuery = {
    metricQuery: MetricQueryRequest;
    explore: string;
    parameters?: ParametersValuesMap;
};

export type ApiCalculateTotalResponse = {
    status: 'ok';
    results: Record<string, number>;
};

export type CalculateSubtotalsFromQuery = CalculateTotalFromQuery & {
    columnOrder: string[];
    pivotDimensions?: string[];
    parameters?: ParametersValuesMap;
    dateZoom?: DateZoom;
};

export type ApiCalculateSubtotalsResponse = {
    status: 'ok';
    results: {
        [subtotalDimensions: string]: {
            [key: string]: number;
        }[];
    };
};

export type ReplaceableFieldMatchMap = {
    [fieldId: string]: {
        fieldId: string;
        label: string;
        match: {
            fieldId: FieldId;
            fieldLabel: string;
        } | null;
        suggestedMatches: Array<{
            fieldId: FieldId;
            fieldLabel: string;
        }>;
    };
};

export type ReplaceableCustomFields = {
    [chartUuid: string]: {
        uuid: string;
        label: string;
        customMetrics: ReplaceableFieldMatchMap;
    };
};

export type ReplaceCustomFields = {
    [chartUuid: string]: {
        customMetrics: {
            [customMetricId: string]: {
                replaceWithFieldId: string;
            };
        };
    };
};

export type SkippedReplaceCustomFields = {
    [chartUuid: string]: {
        customMetrics: {
            [customMetricId: string]: {
                replaceWithFieldId: string;
                reason: string;
            };
        };
    };
};

export type ApiSavedChartSchedulersResponse = {
    status: 'ok';
    results: SchedulerAndTargets[];
};

export type ApiSavedChartPaginatedSchedulersResponse = {
    status: 'ok';
    results: KnexPaginatedData<SchedulerAndTargets[]>;
};

export type ApiCreateSavedChartSchedulerResponse = {
    status: 'ok';
    results: SchedulerAndTargets;
};

export type ApiExportChartImageResponse = {
    status: 'ok';
    results: string; // image URL
};
