import assertUnreachable from '../utils/assertUnreachable';
import { type ViewStatistics } from './analytics';
import { type ConditionalFormattingConfig } from './conditionalFormatting';
import { type CompactOrAlias } from './field';
import { type MetricQuery, type MetricQueryRequest } from './metricQuery';
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
}

export enum ChartType {
    CARTESIAN = 'cartesian',
    TABLE = 'table',
    BIG_NUMBER = 'big_number',
    PIE = 'pie',
    FUNNEL = 'funnel',
    CUSTOM = 'custom',
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
    metadata?: Record<string, SeriesMetadata>;
};

export enum FunnelChartDataInput {
    ROW = 'row',
    COLUMN = 'column',
}

export enum FunnelChartLabelPosition {
    INSIDE = 'inside',
    LEFT = 'left',
    RIGHT = 'right',
}

export type FunnelChart = {
    dataInput?: FunnelChartDataInput;
    fieldId?: string;
    metadata?: Record<string, SeriesMetadata>;
    label?: {
        position?: FunnelChartLabelPosition;
        showValue?: boolean;
        showPercentage?: boolean;
    };
};

export type ColumnProperties = {
    visible?: boolean;
    name?: string;
    frozen?: boolean;
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
    areaStyle?: {};
    showSymbol?: boolean;
    smooth?: boolean;
    markLine?: MarkLine;
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
    xAxis: Axis[];
    yAxis: Axis[];
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

export type CompleteCartesianChartLayout = {
    xField: string;
    yField: string[];
    flipAxes?: boolean | undefined;
    showGridX?: boolean | undefined;
    showGridY?: boolean | undefined;
};

export type CartesianChartLayout = Partial<CompleteCartesianChartLayout>;

export type CustomVis = {
    spec?: object;
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

export type ChartConfig =
    | BigNumberConfig
    | CartesianChartConfig
    | CustomVisConfig
    | PieChartConfig
    | FunnelChartConfig
    | TableChartConfig;

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
        default:
            return assertUnreachable(
                chartType,
                `Unknown chart type: ${chartType}`,
            );
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
> & { chartType?: ChartType | undefined; chartKind?: ChartKind | undefined };

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
};

export type ApiCalculateTotalResponse = {
    status: 'ok';
    results: Record<string, number>;
};
