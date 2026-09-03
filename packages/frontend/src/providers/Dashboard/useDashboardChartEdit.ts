import { type SavedChart } from '@lightdash/common';
import { createContext, useContext } from 'react';

/** Set when tiles can edit in place; absent falls back to navigation. */
export const DashboardChartEditContext = createContext<
    ((chart: SavedChart) => void) | undefined
>(undefined);

export const useDashboardChartEdit = ():
    | ((chart: SavedChart) => void)
    | undefined => useContext(DashboardChartEditContext);
