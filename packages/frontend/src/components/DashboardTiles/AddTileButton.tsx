import {
    DashboardTileTypes,
    FeatureFlags,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import {
    IconAppWindow,
    IconChartBar,
    IconHeading,
    IconInfoCircle,
    IconMarkdown,
    IconNewSection,
    IconPlus,
    IconVideo,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type Props = {
    onAddTiles: (
        tiles: Dashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
    allowedTileTypes?: DashboardTileTypes[];
    chartSpaceUuids?: string[];
    // Overrides the default "New chart" navigation (which leaves for the
    // project's table picker). Embeds use this to build the chart in place.
    onNewChart?: () => void;
} & Pick<ButtonProps, 'disabled' | 'radius'>;

const AddTileButton: FC<Props> = ({
    onAddTiles,
    setAddingTab,
    disabled,
    activeTabUuid,
    dashboardTabs,
    radius,
    allowedTileTypes,
    chartSpaceUuids,
    onNewChart,
}) => {
    const { t } = useTranslation('dashboard');
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();
    const navigate = useNavigate();
    const projectRoute = useOptionalProjectRoute();
    const { health } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;
    const isTileTypeAllowed = useCallback(
        (tileType: DashboardTileTypes) =>
            !allowedTileTypes || allowedTileTypes.includes(tileType),
        [allowedTileTypes],
    );
    const showSavedCharts = isTileTypeAllowed(DashboardTileTypes.SAVED_CHART);
    const showNewChart = onNewChart !== undefined || !allowedTileTypes;
    const showDataApps =
        dataAppsEnabled && isTileTypeAllowed(DashboardTileTypes.DATA_APP);
    const showMarkdown = isTileTypeAllowed(DashboardTileTypes.MARKDOWN);
    const showLoom = isTileTypeAllowed(DashboardTileTypes.LOOM);
    const showTabs = !allowedTileTypes;
    const showHeading = isTileTypeAllowed(DashboardTileTypes.HEADING);

    // Calculate current tiles in the active tab
    const currentTabTilesCount = useMemo(() => {
        if (!dashboardTiles) return 0;
        if (!activeTabUuid) return dashboardTiles.length;
        return dashboardTiles.filter((tile) => tile.tabUuid === activeTabUuid)
            .length;
    }, [dashboardTiles, activeTabUuid]);

    // Get limits from health config
    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab || 50;
    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard || 20;

    // Calculate current tabs count
    const currentTabsCount = useMemo(() => {
        return dashboardTabs ? dashboardTabs.length : 1; // Default dashboard has 1 tab
    }, [dashboardTabs]);

    // Check if we can add a tile to current tab
    const canAddTile = useMemo(() => {
        return currentTabTilesCount < maxTilesPerTab;
    }, [currentTabTilesCount, maxTilesPerTab]);

    // Check if we can add a new tab
    const canAddTab = useMemo(() => {
        return currentTabsCount < maxTabsPerDashboard;
    }, [currentTabsCount, maxTabsPerDashboard]);

    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            onAddTiles([tile]);
        },
        [onAddTiles],
    );
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;

    return (
        <>
            {canAddTile ? (
                <Menu position="bottom" withArrow width={200}>
                    <Menu.Target>
                        <Button
                            size="xs"
                            variant="default"
                            radius={radius}
                            disabled={disabled}
                            leftSection={<MantineIcon icon={IconPlus} />}
                            data-tour-anchor="add-tile"
                            data-tour-hint="Click Add tile"
                        >
                            {t('addTile.addTile')}
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>{t('addTile.tiles')}</Menu.Label>
                        {showSavedCharts && (
                            <Menu.Item
                                onClick={() =>
                                    setIsAddChartTilesModalOpen(true)
                                }
                                leftSection={
                                    <MantineIcon icon={IconChartBar} />
                                }
                                data-tour-anchor="add-saved-chart"
                                data-tour-hint="Choose Saved chart"
                            >
                                {t('addTile.savedChart')}
                            </Menu.Item>
                        )}

                        {showNewChart && (
                            <Menu.Item
                                onClick={() => {
                                    if (onNewChart) {
                                        // Modal supplies the dashboard via
                                        // context; sessionStorage would also
                                        // show the navbar's edit banner.
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
                                    void navigate(
                                        `/projects/${projectUrlIdentifier}/tables`,
                                    );
                                }}
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                <Group gap="xxs">
                                    <Text fz="sm">{t('addTile.newChart')}</Text>
                                    <Tooltip
                                        label={
                                            onNewChart
                                                ? t('addTile.newChartInPlace')
                                                : t('addTile.newChartExclusive')
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            color="dimmed"
                                        />
                                    </Tooltip>
                                </Group>
                            </Menu.Item>
                        )}

                        {showDataApps && (
                            <Menu.Item
                                onClick={() =>
                                    setAddTileType(DashboardTileTypes.DATA_APP)
                                }
                                leftSection={
                                    <MantineIcon icon={IconAppWindow} />
                                }
                            >
                                {t('addTile.dataApp')}
                            </Menu.Item>
                        )}

                        {showMarkdown && (
                            <Menu.Item
                                onClick={() =>
                                    setAddTileType(DashboardTileTypes.MARKDOWN)
                                }
                                leftSection={
                                    <MantineIcon icon={IconMarkdown} />
                                }
                            >
                                {t('addTile.markdown')}
                            </Menu.Item>
                        )}

                        {showLoom && (
                            <Menu.Item
                                onClick={() =>
                                    setAddTileType(DashboardTileTypes.LOOM)
                                }
                                leftSection={<MantineIcon icon={IconVideo} />}
                            >
                                {t('addTile.loom')}
                            </Menu.Item>
                        )}

                        {(showTabs || showHeading) && <Menu.Divider />}

                        {(showTabs || showHeading) && (
                            <Menu.Label>{t('addTile.elements')}</Menu.Label>
                        )}
                        {showTabs && (
                            <Menu.Item
                                onClick={() => setAddingTab(true)}
                                leftSection={
                                    <MantineIcon icon={IconNewSection} />
                                }
                            >
                                {t('addTile.tab')}
                            </Menu.Item>
                        )}

                        {showHeading && (
                            <Menu.Item
                                onClick={() =>
                                    setAddTileType(DashboardTileTypes.HEADING)
                                }
                                leftSection={<MantineIcon icon={IconHeading} />}
                            >
                                {t('addTile.heading')}
                            </Menu.Item>
                        )}
                    </Menu.Dropdown>
                </Menu>
            ) : canAddTab ? (
                <Group gap="xs" wrap="nowrap">
                    <Tooltip
                        label={t('addTile.tileLimitReached', {
                            max: maxTilesPerTab,
                        })}
                    >
                        <span>
                            <Button
                                size="xs"
                                variant="default"
                                radius={radius}
                                disabled
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                {t('addTile.addTile')}
                            </Button>
                        </span>
                    </Tooltip>
                    <Button
                        size="xs"
                        variant="default"
                        radius={radius}
                        disabled={disabled}
                        onClick={() => setAddingTab(true)}
                        leftSection={<MantineIcon icon={IconNewSection} />}
                    >
                        {t('addTile.addTab')}
                    </Button>
                </Group>
            ) : (
                <Tooltip
                    label={t('addTile.allLimitsReached', {
                        maxTiles: maxTilesPerTab,
                        maxTabs: maxTabsPerDashboard,
                    })}
                >
                    <span>
                        <Button
                            size="xs"
                            variant="default"
                            radius={radius}
                            disabled
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            {t('addTile.addTile')}
                        </Button>
                    </span>
                </Tooltip>
            )}

            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles}
                    spaceUuids={chartSpaceUuids}
                />
            )}

            {addTileType === DashboardTileTypes.MARKDOWN ||
            addTileType === DashboardTileTypes.LOOM ||
            addTileType === DashboardTileTypes.HEADING ||
            addTileType === DashboardTileTypes.DATA_APP ? (
                <TileAddModal
                    opened={!!addTileType}
                    type={addTileType}
                    onClose={() => setAddTileType(undefined)}
                    onConfirm={(tile) => {
                        onAddTile(tile);
                        setAddTileType(undefined);
                    }}
                />
            ) : null}
        </>
    );
};

export default AddTileButton;
