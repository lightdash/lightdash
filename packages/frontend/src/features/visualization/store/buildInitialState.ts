import {
    assertUnreachable,
    ChartType,
    type ChartConfig,
} from '@lightdash/common';
import { type VisualizationStoreState } from '.';
import { buildBigNumberEditorState } from './bigNumberEditorSlice';
import { buildCartesianEditorState } from './cartesianEditorSlice';
import { type CartesianIntentState } from './cartesianIntentSlice';
import { buildCustomEditorState } from './customEditorSlice';
import { buildDataAppVizEditorState } from './dataAppVizEditorSlice';
import { type EditorSeedContext } from './editorSlice';
import { buildFunnelEditorState } from './funnelEditorSlice';
import { buildGaugeEditorState } from './gaugeEditorSlice';
import { buildMapEditorState } from './mapEditorSlice';
import { buildPieEditorState } from './pieEditorSlice';
import { buildSankeyEditorState } from './sankeyEditorSlice';
import { buildTableEditorState } from './tableEditorSlice';
import { buildTreemapEditorState } from './treemapEditorSlice';

const emptyEditors = {
    bigNumberEditor: null,
    cartesianEditor: null,
    customEditor: null,
    dataAppVizEditor: null,
    funnelEditor: null,
    gaugeEditor: null,
    mapEditor: null,
    pieEditor: null,
    sankeyEditor: null,
    tableEditor: null,
    treemapEditor: null,
} satisfies Omit<VisualizationStoreState, 'cartesianIntent'>;

const seedEditor = (
    chartConfig: ChartConfig,
    seed: EditorSeedContext,
): Partial<Omit<VisualizationStoreState, 'cartesianIntent'>> => {
    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return {
                cartesianEditor: buildCartesianEditorState(chartConfig.config),
            };
        case ChartType.PIE:
            return { pieEditor: buildPieEditorState(chartConfig.config) };
        case ChartType.FUNNEL:
            return { funnelEditor: buildFunnelEditorState(chartConfig.config) };
        case ChartType.BIG_NUMBER:
            return {
                bigNumberEditor: buildBigNumberEditorState(chartConfig.config),
            };
        case ChartType.TREEMAP:
            return {
                treemapEditor: buildTreemapEditorState(chartConfig.config),
            };
        case ChartType.GAUGE:
            return { gaugeEditor: buildGaugeEditorState(chartConfig.config) };
        case ChartType.MAP:
            return { mapEditor: buildMapEditorState(chartConfig.config) };
        case ChartType.TABLE:
            return {
                tableEditor: buildTableEditorState(chartConfig.config, seed),
            };
        case ChartType.CUSTOM:
            return {
                customEditor: buildCustomEditorState(chartConfig.config),
            };
        case ChartType.SANKEY:
            return { sankeyEditor: buildSankeyEditorState(chartConfig.config) };
        case ChartType.DATA_APP_VIZ:
            return {
                dataAppVizEditor: buildDataAppVizEditorState(
                    chartConfig.config,
                ),
            };
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

/** Seeds the mounted chart type's editor from its config; the others stay empty */
export const buildInitialVisualizationState = (
    chartConfig: ChartConfig,
    seed: EditorSeedContext,
    cartesianIntent: CartesianIntentState = {
        stacking: undefined,
        cartesianType: undefined,
    },
): VisualizationStoreState => ({
    cartesianIntent,
    ...emptyEditors,
    ...seedEditor(chartConfig, seed),
});
