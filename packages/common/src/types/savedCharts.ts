import assertUnreachable from '../utils/assertUnreachable';
import { type ViewStatistics } from './analytics';
import { type ConditionalFormattingConfig } from './conditionalFormatting';
import { type ChartSourceType } from './content';
import { type CompactOrAlias, type FieldId } from './field';
import { type MetricQuery, type MetricQueryRequest } from './metricQuery';
import { type ParametersValuesMap } from './parameters';
// eslint-disable-next-line import/no-cycle
import { type SpaceShare } from './space';
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
    label?: string;
    style?: CompactOrAlias;
    selectedField?: string;
    showBigNumberLabel?: boolean;
    showTableNamesInLabel?: boolean;
    showComparison?: boolean;
    comparisonFormat?: ComparisonFormatTypes;
    flipColors?: boolean;
    comparisonLabel?: string;
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
    color: string;
};
export type PieChart = {
    groupFieldIds?: string[];
    metricId?: string;
    isDonut?: boolean;
    valueLabel?: PieChartValueOptions['valueLabel'];
    showValue?: PieChartValueOptions['showValue'];
    showPercentage?: PieChartValueOptions['showPercentage'];
    groupLabelOverrides?: Record<string, string>;
    groupColorOverrides?: Record<string, string>;
    groupValueOptionOverrides?: Record<string, Partial<PieChartValueOptions>>;
    groupSortOverrides?: string[];
    showLegend?: boolean;
    legendPosition?: PieChartLegendPosition;
    legendMaxItemLength?: number;
    metadata?: Record<string, SeriesMetadata>;
};

export type TreemapChart = {
    visibleMin?: number;
    leafDepth?: number;
    groupFieldIds?: string[];
    sizeMetricId?: string;
    colorMetricId?: string;
    startColor?: string;
    endColor?: string;
    useDynamicColors?: boolean;
    startColorThreshold?: number;
    endColorThreshold?: number;
};

export type GaugeSection = {
    min: number;
    max: number;
    minFieldId?: string;
    maxFieldId?: string;
    color: string;
};

export type GaugeChart = {
    selectedField?: string;
    min?: number;
    max?: number;
    maxFieldId?: string;
    showAxisLabels?: boolean;
    sections?: GaugeSection[];
    customLabel?: string;
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

export type MapChart = {
    mapType?: MapChartLocation;
    customGeoJsonUrl?: string;
    locationType?: MapChartType;
    // Lat/Long fields
    latitudeFieldId?: string;
    longitudeFieldId?: string;
    // Country/Region field
    locationFieldId?: string;
    // Common fields
    valueFieldId?: string;
    showLegend?: boolean;
    // Color range (array of 2-5 colors for gradient)
    colorRange?: string[];
    // Map extent settings (zoom and center are saved when user enables "save map extent")
    defaultZoom?: number;
    defaultCenterLat?: number;
    defaultCenterLon?: number;
    // Scatter bubble size settings (for lat/long maps)
    minBubbleSize?: number;
    maxBubbleSize?: number;
    sizeFieldId?: string;
    // Tile background
    tileBackground?: MapTileBackground;
    backgroundColor?: string;
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
    dataInput?: FunnelChartDataInput;
    fieldId?: string;
    metadata?: Record<string, SeriesMetadata>;
    labelOverrides?: Record<string, string>;
    colorOverrides?: Record<string, string>;
    labels?: {
        position?: FunnelChartLabelPosition;
        showValue?: boolean;
        showPercentage?: boolean;
    };
    showLegend?: boolean;
    legendPosition?: FunnelChartLegendPosition;
};

export type ColumnProperties = {
    visible?: boolean;
    name?: string;
    frozen?: boolean;
    displayStyle?: 'text' | 'bar';
    color?: string;
};

export type TableChart = {
    showColumnCalculation?: boolean;
    showRowCalculation?: boolean;
    showTableNames?: boolean;
    hideRowNumbers?: boolean;
    showResultsTotal?: boolean;
    showSubtotals?: boolean;
    columns?: Record<string, ColumnProperties>;
    conditionalFormattings?: ConditionalFormattingConfig[];
    metricsAsRows?: boolean;
};

export enum CartesianSeriesType {
    LINE = 'line',
    BAR = 'bar',
    SCATTER = 'scatter',
    AREA = 'area',
}

export type PivotValue = {
    field: string;
    value: unknown;
};

export type PivotReference = {
    field: string;
    pivotValues?: PivotValue[];
};

export const isPivotReferenceWithValues = (
    value: PivotReference,
): value is Required<PivotReference> =>
    !!value.pivotValues && value.pivotValues.length > 0;

export type MarkLineData = {
    yAxis?: string;
    xAxis?: string;
    name?: string;
    value?: string;
    type?: string;
    uuid: string;
    lineStyle?: {
        color: string;
    };
    label?: {
        formatter?: string;
        position?: 'start' | 'middle' | 'end';
    };
    dynamicValue?: 'average';
};
export type MarkLine = {
    data: MarkLineData[];
    symbol?: string;
    lineStyle?: {
        color: string;
        width: number;
        type: string;
    };
    label?: {
        formatter?: string;
    };
};
export type Series = {
    encode: {
        xRef: PivotReference;
        yRef: PivotReference;
        x?: string; // hash of xRef
        y?: string; // hash of yRef
    };
    type: CartesianSeriesType;
    stack?: string;
    stackLabel?: {
        show?: boolean;
    };
    name?: string;
    color?: string;
    yAxisIndex?: number;
    label?: {
        show?: boolean;
        position?: 'left' | 'top' | 'right' | 'bottom' | 'inside';
    };
    hidden?: boolean;
    areaStyle?: Record<string, unknown>;
    showSymbol?: boolean;
    smooth?: boolean;
    markLine?: MarkLine;
    isFilteredOut?: boolean;
};

export type EchartsLegend = {
    show?: boolean;
    type?: 'plain' | 'scroll';
    orient?: 'horizontal' | 'vertical';
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    width?: string;
    height?: string;
    align?: 'auto' | 'left' | 'right';
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
    containLabel?: boolean;
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
    width?: string;
    height?: string;
};

export type CompleteEChartsConfig = {
    legend?: EchartsLegend;
    grid?: EchartsGrid;
    series: Series[];
    xAxis: XAxis[];
    yAxis: Axis[];
    tooltip?: string;
    showAxisTicks?: boolean;
};

export type EChartsConfig = Partial<CompleteEChartsConfig>;

type Axis = {
    name?: string;
    min?: string | undefined;
    max?: string | undefined;
    minOffset?: string | undefined;
    maxOffset?: string | undefined;
    inverse?: boolean;
    rotate?: number;
};

export type XAxis = Axis & {
    sortType?: XAxisSortType;
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
    xField: string;
    yField: string[];
    flipAxes?: boolean | undefined;
    showGridX?: boolean | undefined;
    showGridY?: boolean | undefined;
    showXAxis?: boolean | undefined;
    showYAxis?: boolean | undefined;
    stack?: boolean | string | undefined; // Support both old boolean and new StackType string for backward compatibility
};

export type CartesianChartLayout = Partial<CompleteCartesianChartLayout>;

export type CustomVis = {
    spec?: Record<string, unknown>;
};

export type CartesianChart = {
    layout: CartesianChartLayout;
    eChartsConfig: EChartsConfig;
    metadata?: Record<string, SeriesMetadata>;
};

export type BigNumberConfig = {
    type: ChartType.BIG_NUMBER;
    config?: BigNumber;
};

export type CartesianChartConfig = {
    type: ChartType.CARTESIAN;
    config?: CartesianChart;
};

export type CustomVisConfig = {
    type: ChartType.CUSTOM;
    config?: CustomVis;
};

export type PieChartConfig = {
    type: ChartType.PIE;
    config?: PieChart;
};

export type FunnelChartConfig = {
    type: ChartType.FUNNEL;
    config?: FunnelChart;
};

export type TableChartConfig = {
    type: ChartType.TABLE;
    config?: TableChart;
};

export type TreemapChartConfig = {
    type: ChartType.TREEMAP;
    config?: TreemapChart;
};

export type GaugeChartConfig = {
    type: ChartType.GAUGE;
    config?: GaugeChart;
};

export type MapChartConfig = {
    type: ChartType.MAP;
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
    name: string;
    description?: string;
    tableName: string;
    metricQuery: MetricQuery;
    pivotConfig?: {
        columns: string[];
    };
    chartConfig: ChartConfig;
    tableConfig: {
        columnOrder: string[];
    };
    parameters?: ParametersValuesMap;
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
    access: SpaceShare[];
    slug: string;
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
