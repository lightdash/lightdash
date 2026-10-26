import { type VisualizationStoreState } from '.';
import { buildBigNumberEditorState } from './bigNumberEditorSlice';
import { buildCartesianEditorState } from './cartesianEditorSlice';
import { buildCustomEditorState } from './customEditorSlice';
import { buildDataAppVizEditorState } from './dataAppVizEditorSlice';
import { buildFunnelEditorState } from './funnelEditorSlice';
import { buildGaugeEditorState } from './gaugeEditorSlice';
import { buildMapEditorState } from './mapEditorSlice';
import { buildPieEditorState } from './pieEditorSlice';
import { buildSankeyEditorState } from './sankeyEditorSlice';
import { buildTableEditorState } from './tableEditorSlice';
import { buildTreemapEditorState } from './treemapEditorSlice';

export const selectCartesianIntent = (state: VisualizationStoreState) =>
    state.cartesianIntent;

// A chart type's editor is only seeded while it is mounted; before that the
// defaults keep selectors total so consumers never see null.
const defaultBigNumber = buildBigNumberEditorState(undefined);
export const selectBigNumberEditor = (state: VisualizationStoreState) =>
    state.bigNumberEditor ?? defaultBigNumber;
const defaultCartesian = buildCartesianEditorState(undefined);
export const selectCartesianEditor = (state: VisualizationStoreState) =>
    state.cartesianEditor ?? defaultCartesian;
const defaultCustom = buildCustomEditorState();
export const selectCustomEditor = (state: VisualizationStoreState) =>
    state.customEditor ?? defaultCustom;
const defaultDataAppViz = buildDataAppVizEditorState(undefined);
export const selectDataAppVizEditor = (state: VisualizationStoreState) =>
    state.dataAppVizEditor ?? defaultDataAppViz;
const defaultFunnel = buildFunnelEditorState(undefined);
export const selectFunnelEditor = (state: VisualizationStoreState) =>
    state.funnelEditor ?? defaultFunnel;
const defaultGauge = buildGaugeEditorState(undefined);
export const selectGaugeEditor = (state: VisualizationStoreState) =>
    state.gaugeEditor ?? defaultGauge;
const defaultMap = buildMapEditorState(undefined);
export const selectMapEditor = (state: VisualizationStoreState) =>
    state.mapEditor ?? defaultMap;
const defaultPie = buildPieEditorState(undefined);
export const selectPieEditor = (state: VisualizationStoreState) =>
    state.pieEditor ?? defaultPie;
const defaultSankey = buildSankeyEditorState(undefined);
export const selectSankeyEditor = (state: VisualizationStoreState) =>
    state.sankeyEditor ?? defaultSankey;
const defaultTable = buildTableEditorState(undefined);
export const selectTableEditor = (state: VisualizationStoreState) =>
    state.tableEditor ?? defaultTable;
const defaultTreemap = buildTreemapEditorState(undefined, []);
export const selectTreemapEditor = (state: VisualizationStoreState) =>
    state.treemapEditor ?? defaultTreemap;
