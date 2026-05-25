import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type BasePreviewData = {
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
};

export type ArtifactPreview = BasePreviewData & {
    kind: 'artifact';
    artifactUuid: string;
    versionUuid: string;
};

export type DashboardPreview = BasePreviewData & {
    kind: 'dashboard';
    dashboardUuid: string;
};

export type AiPreview = ArtifactPreview | DashboardPreview;

export interface AiPreviewState {
    preview: AiPreview | null;
}

const initialState: AiPreviewState = {
    preview: null,
};

export const aiPreviewSlice = createSlice({
    name: 'aiPreview',
    initialState,
    reducers: {
        setArtifactPreview: (
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
            state.preview = {
                kind: 'artifact',
                ...action.payload,
            };
        },
        setDashboardPreview: (
            state,
            action: PayloadAction<{
                dashboardUuid: string;
                messageUuid: string;
                threadUuid: string;
                projectUuid: string;
                agentUuid: string;
            }>,
        ) => {
            state.preview = {
                kind: 'dashboard',
                ...action.payload,
            };
        },
        clearPreview: (state) => {
            state.preview = null;
        },
    },
});

export const { setArtifactPreview, setDashboardPreview, clearPreview } =
    aiPreviewSlice.actions;
