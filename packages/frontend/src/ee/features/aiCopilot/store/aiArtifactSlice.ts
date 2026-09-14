import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ArtifactData {
    artifactUuid: string;
    versionUuid: string;
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
}

export interface SavedChartPreviewData {
    savedChartUuid: string;
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
}

export interface DataAppPreviewData {
    appUuid: string;
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
    /** null means the app's latest ready version. */
    version: number | null;
    /** Latest ready version at open; a newer one landing moves to latest. */
    latestReadyVersionAtOpen: number | null;
}

export type DataAppPreviewVersion = Pick<
    DataAppPreviewData,
    'version' | 'latestReadyVersionAtOpen'
>;

export type AiPreview =
    | ({ type: 'artifact' } & ArtifactData)
    | ({ type: 'savedChart' } & SavedChartPreviewData)
    | ({ type: 'dataApp' } & DataAppPreviewData);

export interface AiArtifactState {
    preview: AiPreview | null;
}

const initialState: AiArtifactState = {
    preview: null,
};

export const aiArtifactSlice = createSlice({
    name: 'aiArtifact',
    initialState,
    reducers: {
        setPreview: (state, action: PayloadAction<AiPreview>) => {
            state.preview = action.payload;
        },
        clearPreview: (state) => {
            state.preview = null;
        },
        setDataAppPreviewVersion: (
            state,
            action: PayloadAction<DataAppPreviewVersion>,
        ) => {
            if (state.preview?.type !== 'dataApp') return;
            state.preview.version = action.payload.version;
            state.preview.latestReadyVersionAtOpen =
                action.payload.latestReadyVersionAtOpen;
        },
    },
});

export const { setPreview, clearPreview, setDataAppPreviewVersion } =
    aiArtifactSlice.actions;

type StateWithAiArtifact = { aiArtifact: AiArtifactState };

export const selectPreview = (state: StateWithAiArtifact) =>
    state.aiArtifact.preview;

export const selectArtifactPreview = (state: StateWithAiArtifact) =>
    state.aiArtifact.preview?.type === 'artifact'
        ? state.aiArtifact.preview
        : null;

export const selectSavedChartPreview = (state: StateWithAiArtifact) =>
    state.aiArtifact.preview?.type === 'savedChart'
        ? state.aiArtifact.preview
        : null;

export const selectDataAppPreview = (state: StateWithAiArtifact) =>
    state.aiArtifact.preview?.type === 'dataApp'
        ? state.aiArtifact.preview
        : null;
