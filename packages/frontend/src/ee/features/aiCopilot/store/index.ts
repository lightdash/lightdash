import { configureStore } from '@reduxjs/toolkit';
import { aiAgentLauncherSlice } from './aiAgentLauncherSlice';
import { aiAgentThreadModeSlice } from './aiAgentThreadModeSlice';
import { aiAgentThreadStreamSlice } from './aiAgentThreadStreamSlice';
import { aiPreviewSlice } from './aiPreviewSlice';

export const store = configureStore({
    reducer: {
        aiAgentThreadStream: aiAgentThreadStreamSlice.reducer,
        aiAgentThreadMode: aiAgentThreadModeSlice.reducer,
        aiPreview: aiPreviewSlice.reducer,
        aiAgentLauncher: aiAgentLauncherSlice.reducer,
    },
});

export type AiAgentStoreState = ReturnType<typeof store.getState>;
export type AiAgentStoreDispatch = typeof store.dispatch;
