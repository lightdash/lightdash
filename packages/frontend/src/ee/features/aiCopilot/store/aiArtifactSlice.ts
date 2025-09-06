import { type AiAgentMessageAssistant } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ArtifactData {
    artifactUuid: string;
    versionUuid: string;
    message: AiAgentMessageAssistant;
    projectUuid: string;
    agentUuid: string;
}

export interface AiArtifactState {
    artifact: ArtifactData | null;
}

const initialState: AiArtifactState = {
    artifact: null,
};

export const aiArtifactSlice = createSlice({
    name: 'aiArtifact',
    initialState,
    reducers: {
        setArtifact: (
            state,
            action: PayloadAction<{
                artifactUuid: string;
                versionUuid: string;
                message: AiAgentMessageAssistant;
                projectUuid: string;
                agentUuid: string;
            }>,
        ) => {
            const {
                artifactUuid,
                versionUuid,
                message,
                projectUuid,
                agentUuid,
            } = action.payload;
            state.artifact = {
                artifactUuid,
                versionUuid,
                message,
                projectUuid,
                agentUuid,
            };
        },
        clearArtifact: (state) => {
            state.artifact = null;
        },
    },
});

export const { setArtifact, clearArtifact } = aiArtifactSlice.actions;
