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
    elementPickerThreadUuid: string | null;
}

const initialState: AiArtifactState = {
    preview: null,
    elementPickerThreadUuid: null,
};

export const aiArtifactSlice = createSlice({
    name: 'aiArtifact',
    initialState,
    reducers: {
        setPreview: (state, action: PayloadAction<AiPreview>) => {
            state.preview = action.payload;
            state.elementPickerThreadUuid = null;
        },
        clearPreview: (state) => {
            state.preview = null;
            state.elementPickerThreadUuid = null;
        },
        setElementPickerEnabled: (
            state,
            action: PayloadAction<{ threadUuid: string; enabled: boolean }>,
        ) => {
            const { threadUuid, enabled } = action.payload;
            if (enabled) {
                state.elementPickerThreadUuid = threadUuid;
            } else if (state.elementPickerThreadUuid === threadUuid) {
                state.elementPickerThreadUuid = null;
            }
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

export const {
    setPreview,
    clearPreview,
    setDataAppPreviewVersion,
    setElementPickerEnabled,
} = aiArtifactSlice.actions;

type StateWithAiArtifact = { aiArtifact: AiArtifactState };

export const selectPreview = (state: StateWithAiArtifact) =>
    state.aiArtifact.preview;

// A preview belongs to one thread; pages that show none pass [].
export const selectPreviewForThreads =
    (threadUuids: readonly string[]) =>
    (state: StateWithAiArtifact): AiPreview | null => {
        const { preview } = state.aiArtifact;
        return preview !== null && threadUuids.includes(preview.threadUuid)
            ? preview
            : null;
    };

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

export const selectElementPickerEnabled =
    (threadUuid: string) => (state: StateWithAiArtifact) =>
        state.aiArtifact.elementPickerThreadUuid === threadUuid;
