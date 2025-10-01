import { configureStore } from '@reduxjs/toolkit';
import { aiAgentThreadStreamSlice } from './aiAgentThreadStreamSlice';
import { aiAgentThreadNotificationsSlice } from './aiAgentThreadNotificationsSlice';
import { aiArtifactSlice } from './aiArtifactSlice';

export const store = configureStore({
    reducer: {
        aiAgentThreadStream: aiAgentThreadStreamSlice.reducer,
        aiAgentThreadNotifications: aiAgentThreadNotificationsSlice.reducer,
        aiArtifact: aiArtifactSlice.reducer,
    },
});

export type AiAgentStoreState = ReturnType<typeof store.getState>;
export type AiAgentStoreDispatch = typeof store.dispatch;
