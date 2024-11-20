import type { CatalogField } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
            activeMetric: CatalogField | undefined;
        };
        exploreModal: {
            isOpen: boolean;
            activeMetric: CatalogField | undefined;
        };
    };
    abilities: {
        canManageTags: boolean;
        canRefreshCatalog: boolean;
    };
    projectUuid: string | undefined;
    organizationUuid: string | undefined;
    categoryFilters: CatalogField['categories'][number]['tagUuid'][];
    popovers: {
        category: {
            isClosing: boolean;
        };
        description: {
            isClosing: boolean;
        };
    };
};

const initialState: MetricsCatalogState = {
    projectUuid: undefined,
    organizationUuid: undefined,
    categoryFilters: [],
    abilities: {
        canManageTags: false,
        canRefreshCatalog: false,
    },
    modals: {
        chartUsageModal: {
            isOpen: false,
            activeMetric: undefined,
        },
        exploreModal: {
            isOpen: false,
            activeMetric: undefined,
        },
    },
    popovers: {
        category: {
            isClosing: false,
        },
        description: {
            isClosing: false,
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
        setMetricUsageModal: (
            state,
            action: PayloadAction<CatalogField | undefined>,
        ) => {
            state.modals.chartUsageModal.activeMetric = action.payload;
            state.modals.chartUsageModal.isOpen = !!action.payload;
        },
        setExploreModal: (
            state,
            action: PayloadAction<CatalogField | undefined>,
        ) => {
            state.modals.exploreModal.activeMetric = action.payload;
            state.modals.exploreModal.isOpen = !!action.payload;
        },
        setCategoryFilters: (
            state,
            action: PayloadAction<
                CatalogField['categories'][number]['tagUuid'][]
            >,
        ) => {
            state.categoryFilters = action.payload;
        },
        clearCategoryFilters: (state) => {
            state.categoryFilters = [];
        },
        setAbility: (
            state,
            action: PayloadAction<{
                [K in keyof MetricsCatalogState['abilities']]: boolean;
            }>,
        ) => {
            state.abilities = action.payload;
        },
        setCategoryPopoverIsClosing: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.popovers.category.isClosing = action.payload;
        },
        setDescriptionPopoverIsClosing: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.popovers.description.isClosing = action.payload;
        },
    },
});

export const {
    setMetricUsageModal,
    setExploreModal,
    setProjectUuid,
    setCategoryFilters,
    clearCategoryFilters,
    setOrganizationUuid,
    setAbility,
    setCategoryPopoverIsClosing,

    setDescriptionPopoverIsClosing,
} = metricsCatalogSlice.actions;
