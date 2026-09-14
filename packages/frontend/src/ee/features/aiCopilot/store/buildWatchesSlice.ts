// Build watches: data app builds started from a thread that the app-wide
// build watcher follows until their outcome lands. Nothing is persisted.

import {
    createSelector,
    createSlice,
    type PayloadAction,
} from '@reduxjs/toolkit';

export type BuildWatch = {
    appUuid: string;
    version: number;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    /** Known once the app has loaded in the thread. */
    appName: string | null;
};

export type BuildWatchesState = {
    watches: Record<string, BuildWatch>;
    /** Keys whose outcome landed this session; never watched again. */
    landed: Record<string, true>;
};

const initialState: BuildWatchesState = { watches: {}, landed: {} };

export const getBuildWatchKey = ({
    appUuid,
    version,
}: Pick<BuildWatch, 'appUuid' | 'version'>): string => `${appUuid}:${version}`;

const isSameBuildWatch = (a: BuildWatch, b: BuildWatch): boolean =>
    a.appUuid === b.appUuid &&
    a.version === b.version &&
    a.projectUuid === b.projectUuid &&
    a.agentUuid === b.agentUuid &&
    a.threadUuid === b.threadUuid &&
    a.messageUuid === b.messageUuid &&
    a.appName === b.appName;

export const buildWatchesSlice = createSlice({
    name: 'buildWatches',
    initialState,
    reducers: {
        // Idempotent: the build card re-registers on every render.
        addBuildWatch: (state, action: PayloadAction<BuildWatch>) => {
            const key = getBuildWatchKey(action.payload);
            if (state.landed[key]) return;
            const existing = state.watches[key];
            if (existing && isSameBuildWatch(existing, action.payload)) return;
            state.watches[key] = action.payload;
        },
        removeBuildWatch: (
            state,
            action: PayloadAction<Pick<BuildWatch, 'appUuid' | 'version'>>,
        ) => {
            const key = getBuildWatchKey(action.payload);
            delete state.watches[key];
            state.landed[key] = true;
        },
        clearBuildWatches: () => initialState,
    },
});

export const { addBuildWatch, removeBuildWatch, clearBuildWatches } =
    buildWatchesSlice.actions;

type StateWithBuildWatches = { buildWatches: BuildWatchesState };

export const selectBuildWatches = createSelector(
    (state: StateWithBuildWatches) => state.buildWatches.watches,
    (watches): BuildWatch[] => Object.values(watches),
);
