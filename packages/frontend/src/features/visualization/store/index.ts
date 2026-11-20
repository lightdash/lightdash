import {
    combineReducers,
    configureStore,
    type UnknownAction,
} from '@reduxjs/toolkit';
import { changeOriginOf, stampChangeOrigin } from '../../../utils/changeOrigin';
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
    bigNumberEditor: BigNumberEditorState;
    cartesianEditor: CartesianEditorState;
    customEditor: CustomEditorState;
    dataAppVizEditor: DataAppVizEditorState;
    funnelEditor: FunnelEditorState;
    gaugeEditor: GaugeEditorState;
    mapEditor: MapEditorState;
    pieEditor: PieEditorState;
    sankeyEditor: SankeyEditorState;
    tableEditor: TableEditorState;
    treemapEditor: TreemapEditorState;
    /** The gesture of the latest action the user dispatched; 0 before any */
    userEditGesture: number;
};

const userEditGestureReducer = (gesture: number = 0, action: UnknownAction) => {
    const origin = changeOriginOf(action);
    return origin && !origin.isDerived ? origin.gesture : gesture;
};

const visualizationReducer = combineReducers({
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
    userEditGesture: userEditGestureReducer,
});

// One store per mounted VisualizationProvider and chart type
export const createVisualizationStore = (
    preloadedState: Partial<VisualizationStoreState>,
) =>
    configureStore({
        reducer: visualizationReducer,
        preloadedState,
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware().concat(stampChangeOrigin),
        // Every mounted chart has a store, so only development registers them
        devTools: process.env.NODE_ENV === 'development',
    });

export type VisualizationStore = ReturnType<typeof createVisualizationStore>;
export type VisualizationStoreDispatch = VisualizationStore['dispatch'];

export { VisualizationStoreContext } from './context';
export {
    buildInitialVisualizationState,
    isFirstCustomSpec,
} from './buildInitialState';
export { cartesianIntentActions } from './cartesianIntentSlice';
export type { CartesianIntentState } from './cartesianIntentSlice';
export type { EditorFieldUpdate } from './editorSlice';
export { tableCalculationsRenamed } from './editorSlice';
export { bigNumberEditorActions } from './bigNumberEditorSlice';
export type { BigNumberEditorState } from './bigNumberEditorSlice';
export { cartesianEditorActions } from './cartesianEditorSlice';
export type { CartesianEditorState } from './cartesianEditorSlice';
export { customEditorActions } from './customEditorSlice';
export type { CustomEditorState } from './customEditorSlice';
export { dataAppVizEditorActions } from './dataAppVizEditorSlice';
export type { DataAppVizEditorState } from './dataAppVizEditorSlice';
export { funnelEditorActions } from './funnelEditorSlice';
export type { FunnelEditorState } from './funnelEditorSlice';
export { gaugeEditorActions } from './gaugeEditorSlice';
export type { GaugeEditorState } from './gaugeEditorSlice';
export { mapEditorActions } from './mapEditorSlice';
export type { MapEditorState } from './mapEditorSlice';
export { pieEditorActions } from './pieEditorSlice';
export type { PieEditorState } from './pieEditorSlice';
export { sankeyEditorActions } from './sankeyEditorSlice';
export type { SankeyEditorState } from './sankeyEditorSlice';
export { tableEditorActions } from './tableEditorSlice';
export type { TableEditorState } from './tableEditorSlice';
export { treemapEditorActions } from './treemapEditorSlice';
export type { TreemapEditorState } from './treemapEditorSlice';
export type { VisualizationInputs } from './inputs';
export * from './hooks';
export {
    selectDimensionsAndNumericMetrics,
    selectNumericMetricsAndTableCalculations,
} from './inputSelectors';
export * from './pieSelectors';
export * from './bigNumberSelectors';
export * from './cartesianSelectors';
export * from './customSelectors';
export * from './dataAppVizSelectors';
export * from './funnelSelectors';
export * from './gaugeSelectors';
export * from './mapSelectors';
export * from './sankeySelectors';
export * from './tableSelectors';
export * from './treemapSelectors';
export * from './selectors';
