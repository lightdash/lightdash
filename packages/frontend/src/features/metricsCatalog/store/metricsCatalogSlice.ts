import type { CatalogField } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
    };
    abilities: {
        canManageTags: boolean;
    };
    activeMetric: CatalogField | undefined;
    projectUuid: string | undefined;
    organizationUuid: string | undefined;
    tagFilters: CatalogField['catalogTags'][number]['tagUuid'][];
};

const initialState: MetricsCatalogState = {
    activeMetric: undefined,
    projectUuid: undefined,
    organizationUuid: undefined,
    tagFilters: [],
    abilities: {
        canManageTags: false,
    },
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
        setOrganizationUuid: (state, action: PayloadAction<string>) => {
            state.organizationUuid = action.payload;
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
        setAbility: (
            state,
            action: PayloadAction<MetricsCatalogState['abilities']>,
        ) => {
            state.abilities = action.payload;
        },
    },
});

export const {
    setActiveMetric,
    setProjectUuid,
    setTagFilters,
    clearTagFilters,
    setOrganizationUuid,
    setAbility,
} = metricsCatalogSlice.actions;
