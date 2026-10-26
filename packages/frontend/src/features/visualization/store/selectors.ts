import { type VisualizationStoreState } from '.';

export const selectCartesianIntent = (state: VisualizationStoreState) =>
    state.cartesianIntent;
export const selectBigNumberEditor = (state: VisualizationStoreState) =>
    state.bigNumberEditor;
export const selectCartesianEditor = (state: VisualizationStoreState) =>
    state.cartesianEditor;
export const selectCustomEditor = (state: VisualizationStoreState) =>
    state.customEditor;
export const selectDataAppVizEditor = (state: VisualizationStoreState) =>
    state.dataAppVizEditor;
export const selectFunnelEditor = (state: VisualizationStoreState) =>
    state.funnelEditor;
export const selectGaugeEditor = (state: VisualizationStoreState) =>
    state.gaugeEditor;
export const selectMapEditor = (state: VisualizationStoreState) =>
    state.mapEditor;
export const selectPieEditor = (state: VisualizationStoreState) =>
    state.pieEditor;
export const selectSankeyEditor = (state: VisualizationStoreState) =>
    state.sankeyEditor;
export const selectTableEditor = (state: VisualizationStoreState) =>
    state.tableEditor;
export const selectTreemapEditor = (state: VisualizationStoreState) =>
    state.treemapEditor;
