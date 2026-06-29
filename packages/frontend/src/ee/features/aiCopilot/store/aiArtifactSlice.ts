import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ArtifactData {
    artifactUuid: string;
    versionUuid: string;
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
}

export interface AiArtifactState {
    artifact: ArtifactData | null;
    savedChart: SavedChartPreviewData | null;
}

const initialState: AiArtifactState = {
    artifact: null,
    savedChart: null,
};

export interface SavedChartPreviewData {
    savedChartUuid: string;
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
}

export const aiArtifactSlice = createSlice({
    name: 'aiArtifact',
    initialState,
    reducers: {
        setArtifact: (
            state,
            action: PayloadAction<{
                artifactUuid: string;
                versionUuid: string;
                messageUuid: string;
                threadUuid: string;
                projectUuid: string;
                agentUuid: string;
            }>,
        ) => {
            const {
                artifactUuid,
                versionUuid,
                messageUuid,
                threadUuid,
                projectUuid,
                agentUuid,
            } = action.payload;
            state.artifact = {
                artifactUuid,
                versionUuid,
                messageUuid,
                threadUuid,
                projectUuid,
                agentUuid,
            };
            state.savedChart = null;
        },
        setSavedChartPreview: (
            state,
            action: PayloadAction<SavedChartPreviewData>,
        ) => {
            state.savedChart = action.payload;
            state.artifact = null;
        },
        clearArtifact: (state) => {
            state.artifact = null;
        },
        clearSavedChartPreview: (state) => {
            state.savedChart = null;
        },
        clearPreview: (state) => {
            state.artifact = null;
            state.savedChart = null;
        },
    },
});

export const {
    setArtifact,
    setSavedChartPreview,
    clearArtifact,
    clearSavedChartPreview,
    clearPreview,
} = aiArtifactSlice.actions;
