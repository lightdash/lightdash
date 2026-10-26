import { type VisualizationStoreState } from '.';
import { selectDataAppVizEditor } from './selectors';

// Plain projections: each edit assigns a fresh config, so identity tracks changes
export const selectDataAppVizValidConfig = (state: VisualizationStoreState) =>
    selectDataAppVizEditor(state).config;

export const selectDataAppVizUuid = (state: VisualizationStoreState) =>
    selectDataAppVizEditor(state).config?.dataAppVizUuid ?? null;
