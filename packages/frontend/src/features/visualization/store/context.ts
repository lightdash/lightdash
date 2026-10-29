import { createContext } from 'react';
import { type ReactReduxContextValue } from 'react-redux';
import { type VisualizationStoreState } from '.';

// Own context so a chart's store never shadows the explorer or dashboard
// store it is mounted inside, and vice versa.
export const VisualizationStoreContext =
    createContext<ReactReduxContextValue<VisualizationStoreState> | null>(null);
