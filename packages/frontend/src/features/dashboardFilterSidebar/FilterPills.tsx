import {
    FilterOperator,
    getConditionalRuleLabelFromItem,
    isFilterLockedOnTab,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Text, Tooltip } from '@mantine/core';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { getTabsForFilterRule } from '../dashboardFilters/FilterConfiguration/utils';
import pillActionClasses from './FilterPills.module.css';
import classes from './FilterSidebar.module.css';
import { isHiddenOnTab, toggleHiddenOnTab } from './sessionSettings';
import { replaceFilterRule, toggleFilterLockOnTab } from './sidebarState';
import { useFilterSidebar } from './useFilterSidebar';

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
    const {
        editing,
        isSidebarOpen,
        isNew,
        unplacedFilters,
        open,
        removeFilterById,
        getSessionSettings,
        updateSessionSettings,
    } = useFilterSidebar();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
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
    const hasTabs = dashboardTabs.length > 0;
    // Dashboards without tabs store the dashboard uuid as a sentinel
    const tabKey = hasTabs ? activeTabUuid : dashboardUuid;

    const toggleLock = (filter: DashboardFilterRule, lockKey: string) => {
        setDashboardFilters((filters) =>
            replaceFilterRule(
                filters,
                toggleFilterLockOnTab(filter, lockKey, hasTabs),
            ),
        );
        setHaveFiltersChanged(true);
    };

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
                const sessionSettings = getSessionSettings(filter.id);
                const isHidden =
                    !!tabKey && isHiddenOnTab(sessionSettings, tabKey);
                const isLocked =
                    !!tabKey && isFilterLockedOnTab(filter, tabKey, hasTabs);
                const lockLabel = isHidden
                    ? 'Hidden filters cannot be changed by viewers'
                    : `${isLocked ? 'Unlock' : 'Lock'} filter${hasTabs ? ' on this tab' : ''}`;
                const eyeLabel = isHidden
                    ? 'Hidden from viewers. Click to show.'
                    : 'Visible to viewers. Click to hide.';
                const lockSlotClass = isLocked
                    ? pillClasses.lockSlotActive
                    : pillClasses.lockSlot;
                const eyeSlotClass = isHidden
                    ? pillClasses.lockSlotActive
                    : pillClasses.lockSlot;
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
                                    isHidden
                                        ? pillActionClasses.hiddenPill
                                        : '',
                                ].join(' ')}
                                rightSection={
                                    !isSidebarOpen && (
                                        <Group gap={2} wrap="nowrap">
                                            {tabKey && (
                                                <Box
                                                    component="span"
                                                    className={lockSlotClass}
                                                >
                                                    <Tooltip
                                                        fz="xs"
                                                        label={lockLabel}
                                                    >
                                                        <ActionIcon
                                                            size="xs"
                                                            radius="xl"
                                                            disabled={isHidden}
                                                            aria-label={
                                                                lockLabel
                                                            }
                                                            aria-pressed={
                                                                isLocked
                                                            }
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleLock(
                                                                    filter,
                                                                    tabKey,
                                                                );
                                                            }}
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    isLocked
                                                                        ? IconLock
                                                                        : IconLockOpen
                                                                }
                                                                size="sm"
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Box>
                                            )}
                                            {tabKey && (
                                                <Box
                                                    component="span"
                                                    className={eyeSlotClass}
                                                >
                                                    <Tooltip
                                                        fz="xs"
                                                        label={eyeLabel}
                                                    >
                                                        <ActionIcon
                                                            size="xs"
                                                            radius="xl"
                                                            aria-label={
                                                                eyeLabel
                                                            }
                                                            aria-pressed={
                                                                isHidden
                                                            }
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                updateSessionSettings(
                                                                    filter.id,
                                                                    toggleHiddenOnTab(
                                                                        sessionSettings,
                                                                        tabKey,
                                                                    ),
                                                                );
                                                            }}
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    isHidden
                                                                        ? IconEyeOff
                                                                        : IconEye
                                                                }
                                                                size="sm"
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Box>
                                            )}
                                            <Tooltip
                                                fz="xs"
                                                label="Remove filter"
                                            >
                                                <ActionIcon
                                                    size="xs"
                                                    radius="xl"
                                                    aria-label="Remove filter"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeFilterById(
                                                            filter.id,
                                                        );
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconX}
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
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
            {unplacedFilters.map((rule) => {
                const isSelected = editing?.filterId === rule.id;
                return (
                    <Tooltip key={rule.id} fz="xs" label="Not saved">
                        <Box className={classes.pill}>
                            <Button
                                size="xs"
                                variant="default"
                                aria-pressed={isSelected}
                                classNames={{ label: pillClasses.label }}
                                className={[
                                    pillClasses.button,
                                    classes.unplacedPill,
                                    isSelected ? classes.selectedPill : '',
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
                                                    removeFilterById(rule.id);
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
                                onClick={() => open(rule.id)}
                            >
                                <Text fz="inherit" span>
                                    <Text fw={600} span>
                                        {rule.label || 'New filter'}
                                    </Text>{' '}
                                    <Text span c="dimmed">
                                        {'· no fields, not saved'}
                                    </Text>
                                </Text>
                            </Button>
                        </Box>
                    </Tooltip>
                );
            })}
        </>
    );
};
