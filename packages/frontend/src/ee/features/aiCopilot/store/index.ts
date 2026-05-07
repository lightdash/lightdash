import { configureStore } from '@reduxjs/toolkit';
import { aiAgentLauncherSlice } from './aiAgentLauncherSlice';
import { aiAgentThreadStreamSlice } from './aiAgentThreadStreamSlice';
import { aiArtifactSlice } from './aiArtifactSlice';

export const store = configureStore({
    reducer: {
        aiAgentThreadStream: aiAgentThreadStreamSlice.reducer,
        aiArtifact: aiArtifactSlice.reducer,
        aiAgentLauncher: aiAgentLauncherSlice.reducer,
    },
});

export type AiAgentStoreState = ReturnType<typeof store.getState>;
export type AiAgentStoreDispatch = typeof store.dispatch;
