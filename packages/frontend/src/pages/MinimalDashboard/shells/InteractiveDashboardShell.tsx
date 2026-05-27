import { Tabs } from '@mantine-8/core';
import { type FC, useMemo, useState } from 'react';
import { StickyWithDetection } from '../../../components/common/StickyWithDetection';
import { DashboardFiltersBar } from '../../../features/dashboardFilters/DashboardFiltersBar';
import { DashboardFiltersBarSummary } from '../../../features/dashboardFilters/DashboardFiltersBarSummary';
import tabStyles from '../../../features/dashboardTabs/tabs.module.css';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { type MinimalDashboardShellProps } from '../minimalDashboardTypes';
import styles from './InteractiveDashboardShell.module.css';

export const InteractiveDashboardShell: FC<MinimalDashboardShellProps> = ({
    model,
    scrollContainer,
}) => {
    const activeTab = useDashboardContext((c) => c.activeTab);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const hasTilesThatSupportFilters = useDashboardContext(
        (c) => c.hasTilesThatSupportFilters,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardParameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );
    const pinnedParameters = useDashboardContext((c) => c.pinnedParameters);
    const toggleParameterPin = useDashboardContext((c) => c.toggleParameterPin);
    const parameterOrder = useDashboardContext((c) => c.parameterOrder);
    const setParameterOrder = useDashboardContext((c) => c.setParameterOrder);
    const areAllChartsLoaded = useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    );

    const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
    const [isHeaderStuck, setIsHeaderStuck] = useState(false);

    const referencedParameters = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(parameterDefinitions).filter(([key]) =>
                    dashboardParameterReferences.has(key),
                ),
            ),
        [parameterDefinitions, dashboardParameterReferences],
    );

    const activeTabParameterKeys = useMemo(
        () =>
            model.filteredAndSortedDashboardTiles.flatMap(
                (tile) => tileParameterReferences[tile.uuid] ?? [],
            ),
        [model.filteredAndSortedDashboardTiles, tileParameterReferences],
    );

    const activeTabParameters = useMemo(() => {
        if (activeTabParameterKeys.length === 0) {
            return referencedParameters;
        }

        return Object.fromEntries(
            Object.entries(referencedParameters).filter(([key]) =>
                activeTabParameterKeys.includes(key),
            ),
        );
    }, [activeTabParameterKeys, referencedParameters]);

    const totalFiltersCount =
        dashboardFilters.dimensions.length +
        dashboardTemporaryFilters.dimensions.length;
    const totalParametersCount = Object.keys(activeTabParameters).length;
    const hasDashboardTiles = model.filteredAndSortedDashboardTiles.length > 0;

    return (
        <Tabs
            value={activeTab?.uuid ?? null}
            onChange={(value) => {
                if (value) {
                    model.onTabChange(value);
                }
            }}
            classNames={{
                root: tabStyles.tabsRoot,
                list: tabStyles.list,
                tab: `${tabStyles.tab} ${styles.previewTab}`,
            }}
        >
            <StickyWithDetection
                offset={0}
                scrollContainer={scrollContainer}
                onStuckChange={setIsHeaderStuck}
            >
                <div
                    className={`${tabStyles.stickyTabsAndFilters} ${styles.previewStickyTabsAndFilters}`}
                    data-is-stuck={isHeaderStuck}
                >
                    {model.navigableTabs.length > 1 && (
                        <Tabs.List className={styles.previewTabsList}>
                            {model.navigableTabs.map((tab) => (
                                <Tabs.Tab key={tab.uuid} value={tab.uuid}>
                                    {tab.name}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    )}

                    <div
                        className={`${tabStyles.filtersBar} ${styles.previewFiltersBar}`}
                    >
                        {isFiltersCollapsed ? (
                            <DashboardFiltersBarSummary
                                filtersCount={totalFiltersCount}
                                parametersCount={totalParametersCount}
                                dateZoomLabel={
                                    isDateZoomDisabled
                                        ? null
                                        : dateZoomGranularity || 'Default'
                                }
                                onExpand={() => setIsFiltersCollapsed(false)}
                            />
                        ) : (
                            <DashboardFiltersBar
                                isEditMode={false}
                                activeTabUuid={activeTab?.uuid}
                                hasTilesThatSupportFilters={
                                    hasTilesThatSupportFilters
                                }
                                hasDashboardTiles={hasDashboardTiles}
                                parameters={activeTabParameters}
                                parameterValues={parameterValues}
                                onParameterChange={setParameter}
                                onParameterClearAll={clearAllParameters}
                                isParameterLoading={!areAllChartsLoaded}
                                missingRequiredParameters={
                                    missingRequiredParameters
                                }
                                pinnedParameters={pinnedParameters}
                                onParameterPin={toggleParameterPin}
                                parameterOrder={parameterOrder}
                                onParameterReorder={setParameterOrder}
                                isDateZoomDisabled={isDateZoomDisabled}
                                onCollapse={() => setIsFiltersCollapsed(true)}
                            />
                        )}
                    </div>
                </div>
            </StickyWithDetection>
        </Tabs>
    );
};
