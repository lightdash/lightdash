import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ImproveContextNotification {
    toolCallId: string;
    suggestedInstruction: string;
}

type ThreadNotifications = Record<string, ImproveContextNotification[]>;
type State = Record<string, ThreadNotifications>;

const initialState: State = {};

export const aiAgentThreadNotificationsSlice = createSlice({
    name: 'aiAgentThreadNotifications',
    initialState,
    reducers: {
        addImproveContextNotification: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                messageUuid: string;
                toolCallId: string;
                suggestedInstruction: string;
            }>,
        ) => {
            const {
                threadUuid,
                messageUuid,
                toolCallId,
                suggestedInstruction,
            } = action.payload;

            // Initialize thread if it doesn't exist
            if (!state[threadUuid]) {
                state[threadUuid] = {};
            }

            // Initialize message notifications if they don't exist
            if (!state[threadUuid][messageUuid]) {
                state[threadUuid][messageUuid] = [];
            }

            const messageNotifications = state[threadUuid][messageUuid];

            // Check if notification with this toolCallId already exists
            const existingToolCallIndex = messageNotifications.findIndex(
                (notification) => notification.toolCallId === toolCallId,
            );

            // Check if notification with this instruction content already exists
            const existingInstructionIndex = messageNotifications.findIndex(
                (notification) =>
                    notification.suggestedInstruction === suggestedInstruction,
            );

            if (existingToolCallIndex !== -1) {
                // Update existing notification with same toolCallId
                messageNotifications[existingToolCallIndex] = {
                    toolCallId,
                    suggestedInstruction,
                };
            } else if (existingInstructionIndex !== -1) {
                // Update existing notification with same instruction content
                messageNotifications[existingInstructionIndex] = {
                    toolCallId,
                    suggestedInstruction,
                };
            } else {
                // Add new notification
                messageNotifications.push({
                    toolCallId,
                    suggestedInstruction,
                });
            }
        },
        removeImproveContextNotification: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                messageUuid: string;
                toolCallId: string;
            }>,
        ) => {
            const { threadUuid, messageUuid, toolCallId } = action.payload;

            if (state[threadUuid]?.[messageUuid]) {
                state[threadUuid][messageUuid] = state[threadUuid][
                    messageUuid
                ].filter(
                    (notification) => notification.toolCallId !== toolCallId,
                );

                // Clean up empty arrays
                if (state[threadUuid][messageUuid].length === 0) {
                    delete state[threadUuid][messageUuid];
                }

                // Clean up empty threads
                if (Object.keys(state[threadUuid]).length === 0) {
                    delete state[threadUuid];
                }
            }
        },
        clearAllNotificationsForMessage: (
            state,
            action: PayloadAction<{
                threadUuid: string;
                messageUuid: string;
            }>,
        ) => {
            const { threadUuid, messageUuid } = action.payload;

            if (state[threadUuid]?.[messageUuid]) {
                delete state[threadUuid][messageUuid];

                // Clean up empty threads
                if (Object.keys(state[threadUuid]).length === 0) {
                    delete state[threadUuid];
                }
            }
        },
        clearAllNotificationsForThread: (
            state,
            action: PayloadAction<{ threadUuid: string }>,
        ) => {
            const { threadUuid } = action.payload;
            delete state[threadUuid];
        },
    },
});

export const {
    addImproveContextNotification,
    removeImproveContextNotification,
    clearAllNotificationsForMessage,
    clearAllNotificationsForThread,
} = aiAgentThreadNotificationsSlice.actions;
