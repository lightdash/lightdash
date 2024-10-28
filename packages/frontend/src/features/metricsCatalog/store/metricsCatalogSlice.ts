import type { CatalogFieldWithAnalytics } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
    };
    activeMetricChartsUsage:
        | CatalogFieldWithAnalytics['analytics']['charts']
        | undefined;
    projectUuid: string | undefined;
};

const initialState: MetricsCatalogState = {
    activeMetricChartsUsage: undefined,
    projectUuid: undefined,
    modals: {
        chartUsageModal: {
            isOpen: false,
        },
    },
};

export const metricsCatalogSlice = createSlice({
    name: 'metricsCatalog',
    initialState,
    reducers: {
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setActiveMetricChartsUsage: (
            state,
            action: PayloadAction<
                MetricsCatalogState['activeMetricChartsUsage']
            >,
        ) => {
            state.activeMetricChartsUsage = action.payload;
            state.modals.chartUsageModal.isOpen = !!action.payload;
        },
    },
});

export const { setActiveMetricChartsUsage, setProjectUuid } =
    metricsCatalogSlice.actions;
