import { type VisualizationStoreState } from '.';
import { buildDataAppVizEditorState } from './dataAppVizEditorSlice';

const defaultDataAppViz = buildDataAppVizEditorState(undefined);
const selectDataAppVizEditor = (state: VisualizationStoreState) =>
    state.dataAppVizEditor ?? defaultDataAppViz;

// Plain projections: each edit assigns a fresh config, so identity tracks changes
export const selectDataAppVizValidConfig = (state: VisualizationStoreState) =>
    selectDataAppVizEditor(state).config;
