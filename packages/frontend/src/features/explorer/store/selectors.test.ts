import { ChartType, type SavedChart } from '@lightdash/common';
import { explorerActions, explorerReducer } from './explorerSlice';
import {
    selectChartSidebarStep,
    selectHasPaletteChanges,
    selectIsChartTypeAuthoring,
    selectIsDataAppVizVersionReadyForSave,
} from './selectors';

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

describe('chart type authoring selectors', () => {
    it('read the sidebar step and the authoring session', () => {
        const idle = explorerReducer(undefined, { type: 'init' });
        expect(selectChartSidebarStep({ explorer: idle })).toBe('configure');
        expect(selectIsChartTypeAuthoring({ explorer: idle })).toBe(false);

        const explorer = explorerReducer(
            explorerReducer(
                idle,
                explorerActions.setChartSidebarStep('choose'),
            ),
            explorerActions.startChartTypeAuthoring({
                dataAppVizUuid: 'viz-1',
            }),
        );
        expect(selectChartSidebarStep({ explorer })).toBe('configure');
        expect(selectIsChartTypeAuthoring({ explorer })).toBe(false);
        expect(
            selectIsChartTypeAuthoring({
                explorer: explorerReducer(
                    explorer,
                    explorerActions.setIsEditMode(true),
                ),
            }),
        ).toBe(true);
    });
});

describe('selectIsDataAppVizVersionReadyForSave', () => {
    it('waits for an unsaved project chart type to capture its previewed version', () => {
        const explorer = explorerReducer(
            undefined,
            explorerActions.setChartConfig({
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'viz-1',
                        fieldMapping: {},
                    },
                },
            }),
        );

        expect(selectIsDataAppVizVersionReadyForSave({ explorer })).toBe(false);
    });
});
