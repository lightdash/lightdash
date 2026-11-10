import { createContext } from 'react';
import { type ReactReduxContextValue } from 'react-redux';
import { type DashboardStoreState } from '.';

// Own context so the dashboard store never shadows the app-wide AI agent store
// (or an explorer store mounted inside a dashboard), and vice versa.
export const DashboardStoreContext =
    createContext<ReactReduxContextValue<DashboardStoreState> | null>(null);
