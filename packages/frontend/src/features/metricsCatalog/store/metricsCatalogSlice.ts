import type { CatalogField } from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MRT_SortingState } from 'mantine-react-table';
import type { UserWithAbility } from '../../../hooks/user/useUser';

type MetricsCatalogState = {
    modals: {
        chartUsageModal: {
            isOpen: boolean;
        };
        metricExploreModal: {
            isOpen: boolean;
            metric: Pick<CatalogField, 'name' | 'tableName'> | undefined;
        };
    };
    user: UserWithAbility | undefined;
    abilities: {
        canManageTags: boolean;
        canRefreshCatalog: boolean;
        canManageExplore: boolean;
        canManageMetricsTree: boolean;
    };
    activeMetric: CatalogField | undefined;
    projectUuid: string | undefined;
    organizationUuid: string | undefined;
    categoryFilters: CatalogField['categories'][number]['tagUuid'][];
    search: string | undefined;
    tableSorting: MRT_SortingState;
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
    search: undefined,
    tableSorting: [
        {
            id: 'chartUsage',
            desc: true,
        },
    ],
    user: undefined,
    abilities: {
        canManageTags: false,
        canRefreshCatalog: false,
        canManageExplore: false,
        canManageMetricsTree: false,
    },
    modals: {
        chartUsageModal: {
            isOpen: false,
        },
        metricExploreModal: {
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
        setSearch: (state, action: PayloadAction<string | undefined>) => {
            state.search = action.payload;
        },
        setTableSorting: (state, action: PayloadAction<MRT_SortingState>) => {
            state.tableSorting = action.payload;
        },
        setUser: (state, action: PayloadAction<UserWithAbility>) => {
            state.user = action.payload;
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
        toggleMetricExploreModal: (
            state,
            action: PayloadAction<
                Pick<CatalogField, 'name' | 'tableName'> | undefined
            >,
        ) => {
            state.modals.metricExploreModal.isOpen = Boolean(action.payload);
            state.modals.metricExploreModal.metric = action.payload;
        },
    },
});

export const {
    setActiveMetric,
    setProjectUuid,
    setCategoryFilters,
    setOrganizationUuid,
    setAbility,
    setUser,
    setCategoryPopoverIsClosing,
    setDescriptionPopoverIsClosing,
    toggleMetricExploreModal,
    setSearch,
    setTableSorting,
} = metricsCatalogSlice.actions;
