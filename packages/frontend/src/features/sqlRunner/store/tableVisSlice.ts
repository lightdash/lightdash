import {
    ChartKind,
    deepEqual,
    isTableChartSQLConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { setSavedChartData, setSqlRunnerResults } from './sqlRunnerSlice';

type InitialState = {
    defaultColumnConfig: TableChartSqlConfig['columns'] | undefined;
    config: TableChartSqlConfig | undefined;
};

export const tableVisSlice = createSlice({
    name: 'tableVisConfig',
    initialState: {
        defaultColumnConfig: undefined,
        config: undefined,
    } as InitialState,
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
            if (action.payload.results && action.payload.columns) {
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

                const oldDefaultColumnConfig = state.defaultColumnConfig;
                const newDefaultColumnConfig = columns;

                state.defaultColumnConfig = columns;

                if (
                    !state.config ||
                    !deepEqual(
                        oldDefaultColumnConfig || {},
                        newDefaultColumnConfig || {},
                    )
                ) {
                    state.config = {
                        type: ChartKind.TABLE,
                        metadata: {
                            version: 1,
                        },
                        columns,
                    };
                }
            }
        });
        builder.addCase(setSavedChartData, (state, action) => {
            if (isTableChartSQLConfig(action.payload.config)) {
                state.config = action.payload.config;
            }
        });
    },
});

export const { updateFieldLabel, updateColumnVisibility } =
    tableVisSlice.actions;
