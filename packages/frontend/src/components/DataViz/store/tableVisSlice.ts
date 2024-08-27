import {
    ChartKind,
    isTableChartSQLConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { onResults, setChartConfig } from './actions/commonChartActions';

export type TableVizState = {
    defaultColumnConfig: TableChartSqlConfig['columns'] | undefined;
    config: TableChartSqlConfig | undefined;
};

const initialState: TableVizState = {
    defaultColumnConfig: undefined,
    config: undefined,
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
                state.defaultColumnConfig = action.payload.defaultColumnConfig;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isTableChartSQLConfig(action.payload)) {
                state.config = action.payload;
            }
        });
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
