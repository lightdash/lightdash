import type { CatalogField } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
        metricPeekModal: {
            isOpen: boolean;
            metric: Pick<CatalogField, 'name' | 'tableName'> | undefined;
        };
    };
    abilities: {
        canManageTags: boolean;
        canRefreshCatalog: boolean;
        canManageExplore: boolean;
    };
    activeMetric: CatalogField | undefined;
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
    activeMetric: undefined,
    projectUuid: undefined,
    organizationUuid: undefined,
    categoryFilters: [],
    abilities: {
        canManageTags: false,
        canRefreshCatalog: false,
        canManageExplore: false,
    },
    modals: {
        chartUsageModal: {
            isOpen: false,
        },
        metricPeekModal: {
            isOpen: false,
            metric: undefined,
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
        setActiveMetric: (
            state,
            action: PayloadAction<CatalogField | undefined>,
        ) => {
            state.activeMetric = action.payload;
            state.modals.chartUsageModal.isOpen = !!action.payload;
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
        toggleMetricPeekModal: (
            state,
            action: PayloadAction<
                Pick<CatalogField, 'name' | 'tableName'> | undefined
            >,
        ) => {
            state.modals.metricPeekModal.isOpen = Boolean(action.payload);
            state.modals.metricPeekModal.metric = action.payload;
        },
    },
});

export const {
    setActiveMetric,
    setProjectUuid,
    setCategoryFilters,
    clearCategoryFilters,
    setOrganizationUuid,
    setAbility,
    setCategoryPopoverIsClosing,
    setDescriptionPopoverIsClosing,
    toggleMetricPeekModal,
} = metricsCatalogSlice.actions;
