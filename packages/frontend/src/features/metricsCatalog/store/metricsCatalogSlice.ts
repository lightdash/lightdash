import {
    CatalogCategoryFilterMode,
    DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
    SpotlightTableColumns,
    UNCATEGORIZED_TAG_UUID,
    type CatalogField,
    type SpotlightTableConfig,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MRT_SortingState } from 'mantine-react-table';
import type { UserWithAbility } from '../../../hooks/user/useUser';
import { SavedTreeEditMode } from '../types';

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
    user: Pick<UserWithAbility, 'userUuid'> | undefined;
    abilities: {
        canManageTags: boolean;
        canRefreshCatalog: boolean;
        canManageExplore: boolean;
        canManageMetricsTree: boolean;
        canManageSpotlight: boolean;
    };
    activeMetric: CatalogField | undefined;
    projectUuid: string | undefined;
    organizationUuid: string | undefined;
    categoryFilters: CatalogField['categories'][number]['tagUuid'][];
    categoryFilterMode: CatalogCategoryFilterMode;
    tableFilters: string[];
    ownerFilters: string[];
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
    columnConfig: {
        columnOrder: string[];
        columnVisibility: Record<string, boolean>;
    };
    activeTreeUuid: string | null;
    savedTreeEditMode: SavedTreeEditMode;
};

export function convertStateToTableColumnConfig(
    state: MetricsCatalogState['columnConfig'],
): SpotlightTableConfig['columnConfig'] {
    return state.columnOrder.map((column) => ({
        column: column as SpotlightTableColumns,
        isVisible: state.columnVisibility[column],
    }));
}

export function convertTableColumnConfigToState(
    columnConfig: SpotlightTableConfig['columnConfig'],
): MetricsCatalogState['columnConfig'] {
    // Merge with defaults to ensure all columns exist (handles old configs missing new columns)
    const mergedConfig = DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG.map(
        (defaultCol) => {
            const savedCol = columnConfig.find(
                (c) => c.column === defaultCol.column,
            );
            return savedCol ?? defaultCol;
        },
    );

    return {
        columnOrder: mergedConfig.map((column) => column.column),
        columnVisibility: Object.fromEntries(
            mergedConfig.map((column) => [column.column, column.isVisible]),
        ),
    };
}

const initialState: MetricsCatalogState = {
    activeMetric: undefined,
    projectUuid: undefined,
    organizationUuid: undefined,
    categoryFilters: [],
    categoryFilterMode: CatalogCategoryFilterMode.OR,
    tableFilters: [],
    ownerFilters: [],
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
        canManageSpotlight: false,
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
    columnConfig: {
        columnOrder: [],
        columnVisibility: {
            [SpotlightTableColumns.TABLE]: false,
            [SpotlightTableColumns.CHART_USAGE]: false,
            [SpotlightTableColumns.DESCRIPTION]: false,
            [SpotlightTableColumns.CATEGORIES]: false,
            [SpotlightTableColumns.METRIC]: false,
            [SpotlightTableColumns.OWNER]: false,
        },
    },
    activeTreeUuid: null,
    savedTreeEditMode: SavedTreeEditMode.VIEW,
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
            // Reset to OR when cleared or uncategorized selected (AND doesn't apply)
            if (
                action.payload.length === 0 ||
                action.payload.includes(UNCATEGORIZED_TAG_UUID)
            ) {
                state.categoryFilterMode = CatalogCategoryFilterMode.OR;
            }
        },
        setCategoryFilterMode: (
            state,
            action: PayloadAction<CatalogCategoryFilterMode>,
        ) => {
            state.categoryFilterMode = action.payload;
        },
        setTableFilters: (state, action: PayloadAction<string[]>) => {
            state.tableFilters = action.payload;
        },
        setOwnerFilters: (state, action: PayloadAction<string[]>) => {
            state.ownerFilters = action.payload;
        },
        setSearch: (state, action: PayloadAction<string | undefined>) => {
            state.search = action.payload;
        },
        setTableSorting: (state, action: PayloadAction<MRT_SortingState>) => {
            state.tableSorting = action.payload;
        },
        setUser: (
            state,
            action: PayloadAction<Pick<UserWithAbility, 'userUuid'>>,
        ) => {
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
        setColumnOrder: (state, action: PayloadAction<string[]>) => {
            state.columnConfig.columnOrder = action.payload;
        },
        setColumnVisibility: (
            state,
            action: PayloadAction<Record<string, boolean>>,
        ) => {
            state.columnConfig.columnVisibility = Object.fromEntries(
                Object.entries(action.payload).map(([column, isVisible]) => [
                    column,
                    isVisible,
                ]),
            );
        },
        setColumnConfig: (
            state,
            action: PayloadAction<
                Pick<SpotlightTableConfig, 'columnConfig'> | undefined | null
            >,
        ) => {
            const config =
                action.payload?.columnConfig ??
                DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG;
            const formattedConfig = convertTableColumnConfigToState(config);
            state.columnConfig = formattedConfig;
        },
        setActiveTreeUuid: (state, action: PayloadAction<string | null>) => {
            state.activeTreeUuid = action.payload;
        },
        setSavedTreeEditMode: (
            state,
            action: PayloadAction<SavedTreeEditMode>,
        ) => {
            state.savedTreeEditMode = action.payload;
        },
    },
});

export const {
    setActiveMetric,
    setProjectUuid,
    setCategoryFilters,
    setCategoryFilterMode,
    setTableFilters,
    setOwnerFilters,
    setOrganizationUuid,
    setAbility,
    setUser,
    setCategoryPopoverIsClosing,
    setDescriptionPopoverIsClosing,
    toggleMetricExploreModal,
    setSearch,
    setTableSorting,
    setColumnOrder,
    setColumnVisibility,
    setColumnConfig,
    setActiveTreeUuid,
    setSavedTreeEditMode,
} = metricsCatalogSlice.actions;
