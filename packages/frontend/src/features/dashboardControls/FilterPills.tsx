import {
    FilterOperator,
    getConditionalRuleLabelFromItem,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { getTabsForFilterRule } from '../dashboardFilters/FilterConfiguration/utils';
import classes from './FilterPills.module.css';
import { useControlsSidebar } from './useControlsSidebar';

type Props = {
    activeTabUuid: string | undefined;
};

// Operators that take no value, mirroring getFilterRuleWithDefaultValue
const UNARY_OPERATORS = new Set<FilterOperator>([
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
    FilterOperator.IN_PERIOD_TO_DATE,
]);

export const FilterPills: FC<Props> = ({ activeTabUuid }) => {
    const getUiString = useUiStrings();
    const { editing, isSidebarOpen, isNew, open, removeFilterById } =
        useControlsSidebar();
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
                const isDraft = isNew && isSelected && !filter.label;
                const name = isDraft
                    ? 'New filter'
                    : filter.label || labels?.field || 'Filter';
                const hasNoDefault = filter.disabled === true;
                const needsValue =
                    !hasNoDefault &&
                    !UNARY_OPERATORS.has(filter.operator) &&
                    (filter.values === undefined || filter.values.length === 0);
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
                        <Box className={classes.pill}>
                            <Button
                                size="xs"
                                variant="default"
                                aria-pressed={isSelected}
                                classNames={{ label: pillClasses.label }}
                                className={[
                                    pillClasses.button,
                                    isOrphaned
                                        ? pillClasses.inactiveFilter
                                        : '',
                                    isSelected ? classes.selectedPill : '',
                                    isDraft ? classes.draftPill : '',
                                ].join(' ')}
                                rightSection={
                                    !isSidebarOpen && (
                                        <Tooltip fz="xs" label="Remove filter">
                                            <ActionIcon
                                                size="xs"
                                                radius="xl"
                                                aria-label="Remove filter"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFilterById(filter.id);
                                                }}
                                            >
                                                <MantineIcon
                                                    icon={IconX}
                                                    size="sm"
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    )
                                }
                                onClick={() => open(filter.id)}
                            >
                                <Text fz="inherit" span>
                                    <Text fw={600} span>
                                        {name}
                                    </Text>{' '}
                                    {labels === null || hasNoDefault ? (
                                        <Text span c="dimmed">
                                            {'\u00b7 no default'}
                                        </Text>
                                    ) : needsValue ? (
                                        <Text span c="dimmed">
                                            {'\u00b7 value needed'}
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
                        </Box>
                    </Tooltip>
                );
            })}
        </>
    );
};
