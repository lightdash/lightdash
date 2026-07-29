import { type SavedChart } from '@lightdash/common';
import { explorerActions, explorerReducer } from './explorerSlice';
import { selectHasPaletteChanges } from './selectors';

const PALETTE_UUID = '55555555-5555-4555-8555-555555555555';

const savedChartWithPalette = {
    colorPaletteUuid: PALETTE_UUID,
} as SavedChart;

describe('selectHasPaletteChanges', () => {
    it('reports no change for an unsaved chart with the inherited palette', () => {
        const explorer = explorerReducer(
            undefined,
            explorerActions.setColorPaletteUuid(null),
        );

        expect(selectHasPaletteChanges({ explorer })).toBe(false);
    });

    it('reports a change for an unsaved chart with a chosen palette', () => {
        const explorer = explorerReducer(
            undefined,
            explorerActions.setColorPaletteUuid(PALETTE_UUID),
        );

        expect(selectHasPaletteChanges({ explorer })).toBe(true);
    });

    it('reports no change for a saved chart whose palette is untouched', () => {
        const explorer = explorerReducer(
            undefined,
            explorerActions.setSavedChart(savedChartWithPalette),
        );

        expect(selectHasPaletteChanges({ explorer })).toBe(false);
    });

    it('reports a change for a saved chart whose palette was cleared', () => {
        const withSavedChart = explorerReducer(
            undefined,
            explorerActions.setSavedChart(savedChartWithPalette),
        );
        const explorer = explorerReducer(
            withSavedChart,
            explorerActions.setColorPaletteUuid(null),
        );

        expect(selectHasPaletteChanges({ explorer })).toBe(true);
    });
});
