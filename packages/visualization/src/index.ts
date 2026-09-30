/**
 * The public surface of the visualization engine: render any saved chart,
 * or resolve and build one chart type at a time. Editor helpers live in
 * `@lightdash/visualization/editor`.
 */

// The one call a headless consumer makes
export {
    renderChart,
    type RenderChartInput,
    type RenderedChart,
} from './render';

// Inputs
export type { VisualizationContextInput, VisualizationResults } from './types';
export { toResultRows } from './results';
export { computeLimitedRowCount, sliceRows } from './rows';
export {
    DARK_VISUALIZATION_THEME,
    LIGHT_VISUALIZATION_THEME,
    type VisualizationTheme,
} from './theme';

// Colors
export { createColorMappings, type ColorMappings } from './colors/mappings';
export {
    createSeriesColorResolver,
    type SeriesColorResolver,
    type SeriesColorResolverOptions,
} from './colors/resolver';
export type { SeriesLike } from './colors/series';

// Cartesian (bar, line, area, scatter)
export {
    resolveCartesianChartConfig,
    type ResolveCartesianChartConfigArgs,
} from './cartesian/config';
export {
    buildCartesianEchartsOption,
    type CartesianEchartsOption,
    type CartesianEchartsOptionInput,
    type LegendValues,
} from './cartesian/echartsOption';

// Pie
export {
    resolvePieChartConfig,
    type PieChartBuilderConfig,
    type PieChartDataPoint,
    type ResolvedPieChartConfig,
    type ResolvePieChartConfigArgs,
} from './pie/config';
export {
    buildPieEchartsOption,
    type PieEchartsOption,
    type PieEchartsOptionInput,
    type PieSeriesDataPoint,
} from './pie/echartsOption';

// Funnel
export {
    resolveFunnelChartConfig,
    type FunnelSeriesDataPoint,
    type ResolvedFunnelChartConfig,
    type ResolveFunnelChartConfigArgs,
} from './funnel/config';
export {
    buildFunnelEchartsOption,
    type FunnelEchartsOptionInput,
} from './funnel/echartsOption';

// Treemap
export {
    resolveTreemapChartConfig,
    type ResolvedTreemapChartConfig,
    type ResolveTreemapChartConfigArgs,
    type TreemapGroupedSubtotals,
    type TreemapNode,
} from './treemap/config';
export {
    buildTreemapEchartsOption,
    type TreemapEchartsChartConfig,
    type TreemapEchartsOption,
    type TreemapEchartsOptionInput,
} from './treemap/echartsOption';

// Gauge
export {
    resolveGaugeChartConfig,
    type ResolveGaugeChartConfigArgs,
} from './gauge/config';
export {
    buildGaugeEchartsOption,
    type GaugeEchartsOptionInput,
} from './gauge/echartsOption';
export { getGaugeSizes, type GaugeSizes } from './gauge/sizes';

// Sankey
export {
    resolveSankeyChartConfig,
    type ResolveSankeyChartConfigArgs,
} from './sankey/config';
export {
    buildSankeyEchartsOption,
    type SankeyEchartsOptionInput,
} from './sankey/echartsOption';
export type { SankeySeriesDataPoint } from './sankey/transform';

// Custom (Vega)
export {
    buildCustomVisualizationData,
    resolveCustomVisualizationConfig,
    type CustomVisualizationData,
    type ResolveCustomVisualizationConfigArgs,
} from './custom/config';

// Big number
export {
    resolveBigNumberChartConfig,
    type ResolveBigNumberChartConfigArgs,
} from './bigNumber/config';
export {
    buildBigNumberModel,
    type BigNumberComparisonModel,
    type BigNumberModel,
    type BigNumberModelInput,
} from './bigNumber/model';

// Table
export {
    resolveTableChartConfig,
    type ResolvedTableChartConfig,
    type ResolveTableChartConfigArgs,
} from './table/config';
export {
    buildTableModel,
    type TableColumnHeader,
    type TableModel,
    type TableModelColumn,
    type TableModelInput,
    type TableSubtotalCell,
    type TableTotalCell,
} from './table/model';
