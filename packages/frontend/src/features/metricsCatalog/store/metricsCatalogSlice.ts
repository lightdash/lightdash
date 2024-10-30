import type { CatalogFieldWithAnalytics } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
    };
    activeMetric: CatalogFieldWithAnalytics | undefined;
    projectUuid: string | undefined;
};

const initialState: MetricsCatalogState = {
    activeMetric: undefined,
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
        setActiveMetric: (
            state,
            action: PayloadAction<CatalogFieldWithAnalytics | undefined>,
        ) => {
            state.activeMetric = action.payload;
            state.modals.chartUsageModal.isOpen = !!action.payload;
        },
    },
});

export const { setActiveMetric, setProjectUuid } = metricsCatalogSlice.actions;
