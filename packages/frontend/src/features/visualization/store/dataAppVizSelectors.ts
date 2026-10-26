import { type VisualizationStoreState } from '.';
import { buildDataAppVizEditorState } from './dataAppVizEditorSlice';

const defaultDataAppViz = buildDataAppVizEditorState(undefined);

// Plain projection: each edit assigns a fresh config, so identity tracks changes
export const selectDataAppVizValidConfig = (state: VisualizationStoreState) =>
    (state.dataAppVizEditor ?? defaultDataAppViz).config;
