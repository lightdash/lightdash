import {
    DashboardTileTypes,
    FeatureFlags,
    type Dashboard,
} from '@lightdash/common';
import {
    IconAppWindow,
    IconChartBar,
    IconHeading,
    IconMarkdown,
    IconPlus,
    IconVideo,
    type Icon,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
    selectDashboardFilters,
    selectDashboardTiles,
    selectHaveFiltersChanged,
    selectHaveTilesChanged,
    useDashboardSelector,
} from '../../features/dashboard/store';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type FormTileType =
    | DashboardTileTypes.MARKDOWN
    | DashboardTileTypes.LOOM
    | DashboardTileTypes.HEADING
    | DashboardTileTypes.DATA_APP;

export type AddTileOptionId =
    | 'savedChart'
    | 'newChart'
    | 'dataApp'
    | 'markdown'
    | 'loom'
    | 'heading';

export type AddTileOption = {
    id: AddTileOptionId;
    label: string;
    icon: Icon;
    hint: string | null;
    onSelect: () => void;
};

export type AddTileOptionsArgs = {
    onAddTiles: (
        tiles: Dashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => void;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
    allowedTileTypes?: DashboardTileTypes[];
    chartSpaceUuids?: string[];
    // Overrides the default "New chart" navigation (which leaves for the
    // project's table picker). Embeds use this to build the chart in place.
    onNewChart?: () => void;
};

type AddTileOptions = {
    tileOptions: AddTileOption[];
    canAddTile: boolean;
    canAddTab: boolean;
    maxTilesPerTab: number;
    maxTabsPerDashboard: number;
    /** The dialogs the options open; render once beside the options */
    modals: ReactNode;
};

/** The tile types a dashboard can add here, and what choosing each one does */
export const useAddTileOptions = ({
    onAddTiles,
    activeTabUuid,
    dashboardTabs,
    allowedTileTypes,
    chartSpaceUuids,
    onNewChart,
}: AddTileOptionsArgs): AddTileOptions => {
    const [formTileType, setFormTileType] = useState<FormTileType | null>(null);
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState(false);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const haveTilesChanged = useDashboardSelector(selectHaveTilesChanged);
    const haveFiltersChanged = useDashboardSelector(selectHaveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();
    const navigate = useNavigate();
    const projectRoute = useOptionalProjectRoute();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const { health } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;

    const isTileTypeAllowed = (tileType: DashboardTileTypes) =>
        !allowedTileTypes || allowedTileTypes.includes(tileType);

    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab || 50;
    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard || 20;
    const currentTabTilesCount = (dashboardTiles ?? []).filter(
        (tile) => !activeTabUuid || tile.tabUuid === activeTabUuid,
    ).length;
    // A dashboard without tabs still counts as one
    const currentTabsCount = dashboardTabs ? dashboardTabs.length : 1;

    const startNewChart = () => {
        if (onNewChart) {
            // Modal supplies the dashboard via context; sessionStorage would
            // also show the navbar's edit banner.
            onNewChart();
            return;
        }
        storeDashboard(
            dashboardTiles,
            dashboardFilters,
            haveTilesChanged,
            haveFiltersChanged,
            dashboard?.uuid,
            dashboard?.name,
            activeTabUuid,
            dashboardTabs,
            dashboard?.slug,
        );
        void navigate(`/projects/${projectUrlIdentifier}/tables`);
    };

    const candidates: (AddTileOption & { isShown: boolean })[] = [
        {
            id: 'savedChart',
            label: 'Saved chart',
            icon: IconChartBar,
            hint: null,
            onSelect: () => setIsAddChartTilesModalOpen(true),
            isShown: isTileTypeAllowed(DashboardTileTypes.SAVED_CHART),
        },
        {
            id: 'newChart',
            label: 'New chart',
            icon: IconPlus,
            hint: onNewChart
                ? 'Build a new chart and add it to this dashboard'
                : 'Charts generated from here are exclusive to this dashboard',
            onSelect: startNewChart,
            isShown: onNewChart !== undefined || !allowedTileTypes,
        },
        {
            id: 'dataApp',
            label: 'Data app',
            icon: IconAppWindow,
            hint: null,
            onSelect: () => setFormTileType(DashboardTileTypes.DATA_APP),
            isShown:
                dataAppsEnabled &&
                isTileTypeAllowed(DashboardTileTypes.DATA_APP),
        },
        {
            id: 'markdown',
            label: 'Markdown',
            icon: IconMarkdown,
            hint: null,
            onSelect: () => setFormTileType(DashboardTileTypes.MARKDOWN),
            isShown: isTileTypeAllowed(DashboardTileTypes.MARKDOWN),
        },
        {
            id: 'loom',
            label: 'Loom video',
            icon: IconVideo,
            hint: null,
            onSelect: () => setFormTileType(DashboardTileTypes.LOOM),
            isShown: isTileTypeAllowed(DashboardTileTypes.LOOM),
        },
        {
            id: 'heading',
            label: 'Heading',
            icon: IconHeading,
            hint: null,
            onSelect: () => setFormTileType(DashboardTileTypes.HEADING),
            isShown: isTileTypeAllowed(DashboardTileTypes.HEADING),
        },
    ];

    return {
        tileOptions: candidates
            .filter(({ isShown }) => isShown)
            .map(({ isShown: _isShown, ...option }) => option),
        canAddTile: currentTabTilesCount < maxTilesPerTab,
        canAddTab: currentTabsCount < maxTabsPerDashboard,
        maxTilesPerTab,
        maxTabsPerDashboard,
        modals: (
            <>
                {isAddChartTilesModalOpen && (
                    <AddChartTilesModal
                        onClose={() => setIsAddChartTilesModalOpen(false)}
                        onAddTiles={onAddTiles}
                        spaceUuids={chartSpaceUuids}
                    />
                )}
                {formTileType !== null && (
                    <TileAddModal
                        opened
                        type={formTileType}
                        onClose={() => setFormTileType(null)}
                        onConfirm={(tile) => {
                            onAddTiles([tile]);
                            setFormTileType(null);
                        }}
                    />
                )}
            </>
        ),
    };
};
