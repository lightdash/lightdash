import {
    ChartKind,
    isVizTableConfig,
    type VizTableConfig,
    type VizTableOptions,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import {
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';

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
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.TABLE) {
                return;
            }

            state.options = action.payload.options;

            const newConfigHasColumns =
                Object.entries(action.payload.config.columns).length > 0;

            if (
                (!state.config ||
                    !isEqual(state.config, action.payload.config)) &&
                newConfigHasColumns
            ) {
                state.config = action.payload.config;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizTableConfig(action.payload)) {
                state.config = action.payload;
            }
        });
        builder.addCase(resetChartState, () => initialState);
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
