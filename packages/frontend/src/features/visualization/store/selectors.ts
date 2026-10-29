import { type VisualizationStoreState } from '.';

type State = VisualizationStoreState;

export const selectCartesianIntent = (state: State) => state.cartesianIntent;
export const selectBigNumberEditor = (state: State) => state.bigNumberEditor;
export const selectCartesianEditor = (state: State) => state.cartesianEditor;
export const selectCustomEditor = (state: State) => state.customEditor;
export const selectFunnelEditor = (state: State) => state.funnelEditor;
export const selectGaugeEditor = (state: State) => state.gaugeEditor;
export const selectMapEditor = (state: State) => state.mapEditor;
export const selectPieEditor = (state: State) => state.pieEditor;
export const selectSankeyEditor = (state: State) => state.sankeyEditor;
export const selectTableEditor = (state: State) => state.tableEditor;
export const selectTreemapEditor = (state: State) => state.treemapEditor;
