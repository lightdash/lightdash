import {
    ChartKind,
    isVizTableConfig,
    type VizTableConfig,
    type VizTableDisplay,
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
    metadata: {
        version: number;
    };
    columns: VizTableConfig['columns'] | undefined;
    display: VizTableDisplay;
    options: VizTableOptions;
};

const initialState: TableVizState = {
    metadata: {
        version: 1,
    },
    columns: undefined,
    display: {},
    options: { defaultColumnConfig: undefined },
};

export const tableVisSlice = createSlice({
    name: 'tableVisConfig',
    initialState,
    reducers: {
        updateFieldLabel: (
            { columns },
            action: PayloadAction<Record<'reference' | 'label', string>>,
        ) => {
            const { reference, label } = action.payload;
            if (columns && columns[reference]) {
                columns[reference].label = label;
            }
        },
        updateColumnVisibility: (
            { columns },
            action: PayloadAction<{
                reference: string;
                visible: boolean;
            }>,
        ) => {
            const { reference, visible } = action.payload;
            if (columns && columns[reference]) {
                columns[reference].visible = visible;
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
                (!state.columns ||
                    !isEqual(state.columns, action.payload.config.columns)) &&
                newConfigHasColumns
            ) {
                state.columns = action.payload.config.columns;
            }
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizTableConfig(action.payload)) {
                state.columns = action.payload.columns;
            }
        });
        builder.addCase(resetChartState, () => initialState);
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
