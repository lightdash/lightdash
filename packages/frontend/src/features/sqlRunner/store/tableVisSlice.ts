import { ChartKind, type TableChartSqlConfig } from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { setSaveChartData, setSqlRunnerResults } from './sqlRunnerSlice';

const initialState: { config: TableChartSqlConfig | undefined } = {
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
        builder.addCase(setSqlRunnerResults, (state, action) => {
            if (state.config === undefined) {
                // TODO: this should come from the transformer
                const columns = Object.keys(action.payload.results[0]).reduce<
                    TableChartSqlConfig['columns']
                >(
                    (acc, key) => ({
                        ...acc,
                        [key]: {
                            visible: true,
                            reference: key,
                            label: key,
                            frozen: true,
                            order: undefined,
                        },
                    }),
                    {},
                );
                state.config = {
                    type: ChartKind.TABLE,
                    metadata: {
                        version: 1,
                    },
                    columns,
                };
            }
        });
        builder.addCase(setSaveChartData, (state, action) => {
            if (action.payload.config.type === ChartKind.TABLE) {
                state.config = action.payload.config;
            }
        });
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
