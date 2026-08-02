import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// The piece of content a data issue is being filed against. Captured at the
// click site (dashboard / tile / chart) and used to pre-fill the modal.
export type CreateIssueContext = {
    projectUuid: string;
    chartUuid?: string;
    dashboardUuid?: string;
    tileUuid?: string;
};

export interface CreateIssueState {
    open: boolean;
    context: CreateIssueContext | null;
}

const initialState: CreateIssueState = {
    open: false,
    context: null,
};

export const createIssueSlice = createSlice({
    name: 'createIssue',
    initialState,
    reducers: {
        openCreateIssue: (
            state,
            action: PayloadAction<CreateIssueContext | null>,
        ) => {
            state.open = true;
            state.context = action.payload;
        },
        closeCreateIssue: (state) => {
            state.open = false;
            state.context = null;
        },
    },
});

export const { openCreateIssue, closeCreateIssue } = createIssueSlice.actions;
