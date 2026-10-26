import { configureStore } from '@reduxjs/toolkit';
import {
    bigNumberEditorReducer,
    type BigNumberEditorState,
} from './bigNumberEditorSlice';
import {
    cartesianEditorReducer,
    type CartesianEditorState,
} from './cartesianEditorSlice';
import {
    cartesianIntentReducer,
    type CartesianIntentState,
} from './cartesianIntentSlice';
import {
    customEditorReducer,
    type CustomEditorState,
} from './customEditorSlice';
import {
    dataAppVizEditorReducer,
    type DataAppVizEditorState,
} from './dataAppVizEditorSlice';
import {
    funnelEditorReducer,
    type FunnelEditorState,
} from './funnelEditorSlice';
import { gaugeEditorReducer, type GaugeEditorState } from './gaugeEditorSlice';
import { mapEditorReducer, type MapEditorState } from './mapEditorSlice';
import { pieEditorReducer, type PieEditorState } from './pieEditorSlice';
import {
    sankeyEditorReducer,
    type SankeyEditorState,
} from './sankeyEditorSlice';
import { tableEditorReducer, type TableEditorState } from './tableEditorSlice';
import {
    treemapEditorReducer,
    type TreemapEditorState,
} from './treemapEditorSlice';

export type VisualizationStoreState = {
    cartesianIntent: CartesianIntentState;
    bigNumberEditor: BigNumberEditorState | null;
    cartesianEditor: CartesianEditorState | null;
    customEditor: CustomEditorState | null;
    dataAppVizEditor: DataAppVizEditorState | null;
    funnelEditor: FunnelEditorState | null;
    gaugeEditor: GaugeEditorState | null;
    mapEditor: MapEditorState | null;
    pieEditor: PieEditorState | null;
    sankeyEditor: SankeyEditorState | null;
    tableEditor: TableEditorState | null;
    treemapEditor: TreemapEditorState | null;
};

// One store per mounted VisualizationProvider
export const createVisualizationStore = () =>
    configureStore({
        reducer: {
            cartesianIntent: cartesianIntentReducer,
            bigNumberEditor: bigNumberEditorReducer,
            cartesianEditor: cartesianEditorReducer,
            customEditor: customEditorReducer,
            dataAppVizEditor: dataAppVizEditorReducer,
            funnelEditor: funnelEditorReducer,
            gaugeEditor: gaugeEditorReducer,
            mapEditor: mapEditorReducer,
            pieEditor: pieEditorReducer,
            sankeyEditor: sankeyEditorReducer,
            tableEditor: tableEditorReducer,
            treemapEditor: treemapEditorReducer,
        },
    });

export type VisualizationStore = ReturnType<typeof createVisualizationStore>;
export type VisualizationStoreDispatch = VisualizationStore['dispatch'];

export { VisualizationStoreContext } from './context';
export { cartesianIntentActions } from './cartesianIntentSlice';
export type { CartesianIntentState } from './cartesianIntentSlice';
export type { EditorFieldUpdate } from './editorSlice';
export {
    bigNumberEditorActions,
    buildBigNumberEditorState,
} from './bigNumberEditorSlice';
export type { BigNumberEditorState } from './bigNumberEditorSlice';
export {
    cartesianEditorActions,
    buildCartesianEditorState,
} from './cartesianEditorSlice';
export type { CartesianEditorState } from './cartesianEditorSlice';
export {
    customEditorActions,
    buildCustomEditorState,
} from './customEditorSlice';
export type { CustomEditorState } from './customEditorSlice';
export {
    dataAppVizEditorActions,
    buildDataAppVizEditorState,
} from './dataAppVizEditorSlice';
export type { DataAppVizEditorState } from './dataAppVizEditorSlice';
export {
    funnelEditorActions,
    buildFunnelEditorState,
} from './funnelEditorSlice';
export type { FunnelEditorState } from './funnelEditorSlice';
export { gaugeEditorActions, buildGaugeEditorState } from './gaugeEditorSlice';
export type { GaugeEditorState } from './gaugeEditorSlice';
export { mapEditorActions, buildMapEditorState } from './mapEditorSlice';
export type { MapEditorState } from './mapEditorSlice';
export { pieEditorActions, buildPieEditorState } from './pieEditorSlice';
export type { PieEditorState } from './pieEditorSlice';
export {
    sankeyEditorActions,
    buildSankeyEditorState,
} from './sankeyEditorSlice';
export type { SankeyEditorState } from './sankeyEditorSlice';
export { tableEditorActions, buildTableEditorState } from './tableEditorSlice';
export type { TableEditorState } from './tableEditorSlice';
export {
    treemapEditorActions,
    buildTreemapEditorState,
} from './treemapEditorSlice';
export type { TreemapEditorState } from './treemapEditorSlice';
export * from './hooks';
export * from './selectors';
