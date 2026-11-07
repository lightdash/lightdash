import { createContext, useContext } from 'react';
import { type LiveSourceConnection } from './liveSourceRows';

/** What an admin can do to live data sources; LiveSourceManager provides it. */
export type LiveSourceActions = {
    add: () => void;
    edit: (connection: LiveSourceConnection) => void;
    /** Null when this instance has no sign-in for the integration. */
    getReconnect: (connection: LiveSourceConnection) => (() => void) | null;
    remove: (connection: LiveSourceConnection) => void;
};

export const LiveSourceActionsContext = createContext<LiveSourceActions | null>(
    null,
);

/** Null for people who don't manage live data sources. */
export const useLiveSourceActions = () => useContext(LiveSourceActionsContext);
