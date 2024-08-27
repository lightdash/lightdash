import {
    ChartKind,
    isVizTableConfig,
    type VizTableConfig,
    type VizTableOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { onResults, setChartConfig } from './actions/commonChartActions';

export type TableVizState = {
    config: VizTableConfig | undefined;
    options: VizTableOptions;
};

const initialState: TableVizState = {
    config: undefined,
    options: { defaultColumnConfig: undefined },
};

export const tableVisSlice = createSlice({
    name: 'tableVisConfig',
    initialState,
    reducers: {
        updateFieldLabel: (
            { config },
            action: PayloadAction<Record<'reference' | 'label', string>>,
        ) => {
            const { reference, label } = action.payload;
            if (config && config.columns[reference]) {
                config.columns[reference].label = label;
            }
        },
        updateColumnVisibility: (
            { config },
            action: PayloadAction<{
                reference: string;
                visible: boolean;
            }>,
        ) => {
            const { reference, visible } = action.payload;
            if (config && config.columns[reference]) {
                config.columns[reference].visible = visible;
            }
        },
    },
    extraReducers: (builder) => {
        builder.addCase(onResults, (state, action) => {
            if (action.payload.type === ChartKind.TABLE) {
                state.options = action.payload.options;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizTableConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
