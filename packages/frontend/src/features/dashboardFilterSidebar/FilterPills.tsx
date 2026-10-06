import {
    getConditionalRuleLabelFromItem,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { getTabsForFilterRule } from '../dashboardFilters/FilterConfiguration/utils';
import classes from './FilterSidebar.module.css';
import { useFilterSidebar } from './useFilterSidebar';

type Props = {
    activeTabUuid: string | undefined;
};

export const FilterPills: FC<Props> = ({ activeTabUuid }) => {
    const getUiString = useUiStrings();
    const { editing, open } = useFilterSidebar();
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const sortedTabUuids = useMemo(
        () =>
            [...dashboardTabs]
                .sort((a, b) => a.order - b.order)
                .map((tab) => tab.uuid),
        [dashboardTabs],
    );
    const tabsEnabled = dashboardTabs.length > 1;

    const pills = [...dashboardFilters.dimensions, ...dashboardFilters.metrics]
        .map((filter: DashboardFilterRule) => {
            const appliesToTabs = getTabsForFilterRule(
                filter,
                dashboardTiles,
                sortedTabUuids,
                filterableFieldsByTileUuid,
            );
            return {
                filter,
                isOrphaned: appliesToTabs.length === 0,
                isSelected: editing?.filterId === filter.id,
                isOnActiveTab:
                    !activeTabUuid || appliesToTabs.includes(activeTabUuid),
            };
        })
        .filter(
            (pill) => pill.isOnActiveTab || pill.isOrphaned || pill.isSelected,
        );

    return (
        <>
            {pills.map(({ filter, isOrphaned, isSelected }) => {
                const field = allFilterableFieldsMap[filter.target.fieldId];
                const labels = field
                    ? getConditionalRuleLabelFromItem(
                          filter,
                          field,
                          getUiString,
                      )
                    : null;
                const name = filter.label || labels?.field || 'Filter';
                return (
                    <Tooltip
                        key={filter.id}
                        disabled={!isOrphaned}
                        label={getUiString(
                            tabsEnabled
                                ? 'filters.notAppliedToAnyTabs'
                                : 'filters.notAppliedToAnyTiles',
                        )}
                    >
                        <Button
                            size="xs"
                            variant="default"
                            aria-pressed={isSelected}
                            classNames={{ label: pillClasses.label }}
                            className={[
                                pillClasses.button,
                                isOrphaned ? pillClasses.inactiveFilter : '',
                                isSelected ? classes.selectedPill : '',
                            ].join(' ')}
                            onClick={() => open(filter.id)}
                        >
                            <Text fz="inherit" span>
                                <Text fw={600} span>
                                    {name}
                                </Text>{' '}
                                {filter.disabled || labels === null ? (
                                    <Text span c="dimmed">
                                        is any value
                                    </Text>
                                ) : (
                                    <>
                                        <Text span c="dimmed">
                                            {labels.operator}
                                        </Text>{' '}
                                        <Text fw={700} span>
                                            {labels.value}
                                        </Text>
                                    </>
                                )}
                            </Text>
                        </Button>
                    </Tooltip>
                );
            })}
        </>
    );
};
