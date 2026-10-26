import { type VisualizationStoreState } from '.';

// Plain projection: each edit assigns a fresh config, so identity tracks changes
export const selectDataAppVizValidConfig = (state: VisualizationStoreState) =>
    state.dataAppVizEditor.config;
