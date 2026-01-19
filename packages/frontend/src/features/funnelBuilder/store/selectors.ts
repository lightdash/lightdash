import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../sqlRunner/store';

/**
 * Select results steps (for chart).
 */
export const selectResultsSteps = createSelector(
    [(state: RootState) => state.funnelBuilder.results],
    (results) => results?.steps ?? [],
);
