import {
    ChartKind,
    isVizBigNumberConfig,
    VIZ_DEFAULT_AGGREGATION,
    type CompactOrAlias,
    type ComparisonFormatTypes,
    type VizAggregationOptions,
    type VizBigNumberConditionalRule,
    type VizBigNumberConfig,
    type VizBigNumberOptions,
    type VizConfigErrors,
} from '@lightdash/common';
import type { PayloadAction, SerializedError } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { prepareAndFetchChartData } from '../../../features/sqlRunner/store/thunks';
import {
    resetChartState,
    setChartConfig,
    setChartOptionsAndConfig,
} from './actions/commonChartActions';

export type BigNumberState = {
    metadata: {
        version: number;
    };
    fieldConfig: VizBigNumberConfig['fieldConfig'] | undefined;
    display: VizBigNumberConfig['display'];
    options: VizBigNumberOptions;
    errors: VizConfigErrors | undefined;
    chartDataLoading: boolean;
    chartDataError: SerializedError | null | undefined;
    chartData:
        | Awaited<
              ReturnType<
                  (typeof prepareAndFetchChartData)['fulfilled']
              >['payload']
          >
        | undefined;
};

const initialState: BigNumberState = {
    metadata: {
        version: 1,
    },
    fieldConfig: undefined,
    display: {},
    options: {
        metricFieldOptions: [],
        customMetricFieldOptions: [],
    },
    errors: undefined,
    chartDataLoading: false,
    chartDataError: undefined,
    chartData: undefined,
};

/** The value is always y[0]; the optional comparison field is always y[1]. */
const VALUE_INDEX = 0;
const COMPARISON_INDEX = 1;

const defaultAggregationFor = (
    state: BigNumberState,
    reference: string,
): VizAggregationOptions => {
    const metric = state.options.metricFieldOptions.find(
        (option) => option.reference === reference,
    );
    const customMetric = state.options.customMetricFieldOptions.find(
        (option) => option.reference === reference,
    );
    return (
        metric?.aggregation ??
        customMetric?.aggregationOptions?.[0] ??
        customMetric?.aggregation ??
        VIZ_DEFAULT_AGGREGATION
    );
};

export const bigNumberConfigSlice = createSlice({
    name: 'bigNumberConfig',
    initialState,
    reducers: {
        setValueReference: (state, action: PayloadAction<string>) => {
            if (!state.fieldConfig) return;
            state.fieldConfig.y[VALUE_INDEX] = {
                reference: action.payload,
                aggregation: defaultAggregationFor(state, action.payload),
            };
        },
        setValueAggregation: (
            state,
            action: PayloadAction<VizAggregationOptions>,
        ) => {
            const value = state.fieldConfig?.y[VALUE_INDEX];
            if (!value) return;
            value.aggregation = action.payload;
        },
        setComparisonReference: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            if (!state.fieldConfig) return;
            if (action.payload === undefined) {
                state.fieldConfig.y = state.fieldConfig.y.slice(
                    0,
                    COMPARISON_INDEX,
                );
                return;
            }
            state.fieldConfig.y[COMPARISON_INDEX] = {
                reference: action.payload,
                aggregation: defaultAggregationFor(state, action.payload),
            };
        },
        setComparisonAggregation: (
            state,
            action: PayloadAction<VizAggregationOptions>,
        ) => {
            const comparison = state.fieldConfig?.y[COMPARISON_INDEX];
            if (!comparison) return;
            comparison.aggregation = action.payload;
        },
        setLabel: (state, action: PayloadAction<string | undefined>) => {
            state.display = { ...state.display, label: action.payload };
        },
        setShowLabel: (state, action: PayloadAction<boolean>) => {
            state.display = { ...state.display, showLabel: action.payload };
        },
        setStyle: (
            state,
            action: PayloadAction<CompactOrAlias | undefined>,
        ) => {
            state.display = { ...state.display, style: action.payload };
        },
        setShowComparison: (state, action: PayloadAction<boolean>) => {
            state.display = {
                ...state.display,
                showComparison: action.payload,
            };
            // Turning the comparison off drops the field so the query stops
            // aggregating a column nothing reads.
            if (!action.payload && state.fieldConfig) {
                state.fieldConfig.y = state.fieldConfig.y.slice(
                    0,
                    COMPARISON_INDEX,
                );
            }
        },
        setComparisonFormat: (
            state,
            action: PayloadAction<ComparisonFormatTypes>,
        ) => {
            state.display = {
                ...state.display,
                comparisonFormat: action.payload,
            };
        },
        setComparisonLabel: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            state.display = {
                ...state.display,
                comparisonLabel: action.payload,
            };
        },
        setFlipColors: (state, action: PayloadAction<boolean>) => {
            state.display = { ...state.display, flipColors: action.payload };
        },
        addConditionalFormattingRule: (
            state,
            action: PayloadAction<VizBigNumberConditionalRule>,
        ) => {
            state.display = {
                ...state.display,
                conditionalFormatting: [
                    ...(state.display?.conditionalFormatting ?? []),
                    action.payload,
                ],
            };
        },
        updateConditionalFormattingRule: (
            state,
            action: PayloadAction<{
                index: number;
                rule: VizBigNumberConditionalRule;
            }>,
        ) => {
            const rules = [...(state.display?.conditionalFormatting ?? [])];
            if (!rules[action.payload.index]) return;
            rules[action.payload.index] = action.payload.rule;
            state.display = { ...state.display, conditionalFormatting: rules };
        },
        removeConditionalFormattingRule: (
            state,
            action: PayloadAction<number>,
        ) => {
            state.display = {
                ...state.display,
                conditionalFormatting: (
                    state.display?.conditionalFormatting ?? []
                ).filter((_, index) => index !== action.payload),
            };
        },
    },
    extraReducers: (builder) => {
        builder.addCase(prepareAndFetchChartData.pending, (state) => {
            state.chartDataLoading = true;
            state.chartDataError = undefined;
        });
        builder.addCase(prepareAndFetchChartData.fulfilled, (state, action) => {
            state.chartDataLoading = false;
            state.chartData = action.payload;
        });
        builder.addCase(prepareAndFetchChartData.rejected, (state, action) => {
            state.chartDataLoading = false;
            state.chartData = undefined;
            state.chartDataError = action.error;
        });
        builder.addCase(setChartOptionsAndConfig, (state, action) => {
            if (action.payload.type !== ChartKind.BIG_NUMBER) {
                return;
            }

            state.options = action.payload.options;

            if (!state.fieldConfig && action.payload.config.fieldConfig) {
                state.fieldConfig = action.payload.config.fieldConfig;
            }
            if (!state.display && action.payload.config.display) {
                state.display = action.payload.config.display;
            }

            state.errors = action.payload.errors;
        });
        builder.addCase(setChartConfig, (state, action) => {
            if (isVizBigNumberConfig(action.payload)) {
                state.fieldConfig = action.payload.fieldConfig;
                state.display = action.payload.display;
            }
        });
        builder.addCase(resetChartState, () => initialState);
    },
});

export const {
    setValueReference,
    setValueAggregation,
    setComparisonReference,
    setComparisonAggregation,
    setLabel,
    setShowLabel,
    setStyle,
    setShowComparison,
    setComparisonFormat,
    setComparisonLabel,
    setFlipColors,
    addConditionalFormattingRule,
    updateConditionalFormattingRule,
    removeConditionalFormattingRule,
} = bigNumberConfigSlice.actions;
