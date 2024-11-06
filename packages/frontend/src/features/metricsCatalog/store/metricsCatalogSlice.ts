import type { CatalogField } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
    };
    activeMetric: CatalogField | undefined;
    projectUuid: string | undefined;
    tagFilters: CatalogField['catalogTags'][number]['tagUuid'][];
};

const initialState: MetricsCatalogState = {
    activeMetric: undefined,
    projectUuid: undefined,
    tagFilters: [],
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
            action: PayloadAction<CatalogField | undefined>,
        ) => {
            state.activeMetric = action.payload;
            state.modals.chartUsageModal.isOpen = !!action.payload;
        },
        setTagFilters: (
            state,
            action: PayloadAction<
                CatalogField['catalogTags'][number]['tagUuid'][]
            >,
        ) => {
            state.tagFilters = action.payload;
        },
        clearTagFilters: (state) => {
            state.tagFilters = [];
        },
    },
});

export const {
    setActiveMetric,
    setProjectUuid,
    setTagFilters,
    clearTagFilters,
} = metricsCatalogSlice.actions;
