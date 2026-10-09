import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Tooltip } from '@mantine/core';
import {
    IconAsterisk,
    IconGripVertical,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { showsComposedFilterValue } from '../dashboardFilters/ActiveFilters/filterLabels';
import {
    getFilterLockKey,
    getFilterLockLabel,
    getFilterLockToggle,
} from '../dashboardFilters/ActiveFilters/filterLock';
import { FilterRuleLabel } from '../dashboardFilters/ActiveFilters/FilterRuleLabel';
import { getTruncatedValuesDisplay } from '../dashboardFilters/ActiveFilters/utils';
import { useFilterChipRequirementState } from '../dashboardFilters/FilterRequirements/useFilterChipRequirementState';
import classes from './FilterPills.module.css';
import { replaceFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = {
    filter: DashboardFilterRule;
    field: DashboardFilterableField | undefined;
    isOrphaned: boolean;
    orphanedTooltip: string;
    isSelected: boolean;
    /** A new control that has no label yet. */
    isDraft: boolean;
    /** While open the pill is only a click target: no grip, lock or X. */
    isSidebarOpen: boolean;
    activeTabUuid: string | undefined;
    hasTabs: boolean;
    dashboardUuid: string | undefined;
};

export const FilterPill: FC<Props> = memo(
    ({
        filter,
        field,
        isOrphaned,
        orphanedTooltip,
        isSelected,
        isDraft,
        isSidebarOpen,
        activeTabUuid,
        hasTabs,
        dashboardUuid,
    }) => {
        const { track } = useTracking();
        const open = useControlsSidebarSelector((c) => c.open);
        const removeFilterById = useControlsSidebarSelector(
            (c) => c.removeFilterById,
        );
        const setDashboardFilters = useDashboardContext(
            (c) => c.setDashboardFilters,
        );
        const setHaveFiltersChanged = useDashboardContext(
            (c) => c.setHaveFiltersChanged,
        );
        const { showRequirementIcon, isRequirementUnmet, requirementTooltip } =
            useFilterChipRequirementState(filter);

        const truncated = useMemo(
            () =>
                getTruncatedValuesDisplay(
                    filter.values,
                    showsComposedFilterValue(
                        field?.type,
                        filter.target.fallbackType,
                    ),
                    filter.operator,
                ),
            [filter, field],
        );

        const isLocked = isFilterLockedOnTab(filter, activeTabUuid, hasTabs);
        const lockKey = getFilterLockKey({
            hasTabs,
            activeTabUuid,
            dashboardUuid,
        });
        const lockLabel = getFilterLockLabel(isLocked, hasTabs);

        const toggleLock = () => {
            const toggle = getFilterLockToggle(filter, {
                isLocked,
                hasTabs,
                activeTabUuid,
                dashboardUuid,
            });
            if (!toggle) return;
            track(toggle.event);
            setDashboardFilters((filters) =>
                replaceFilterRule(filters, toggle.filterRule),
            );
            setHaveFiltersChanged(true);
        };

        const isDraggable = !isSidebarOpen;

        return (
            <Tooltip
                fz="xs"
                maw={300}
                disabled={!isOrphaned}
                label={orphanedTooltip}
            >
                <Box className={classes.pill}>
                    <Button
                        size="xs"
                        variant="default"
                        aria-pressed={isSelected}
                        classNames={{ label: pillClasses.label }}
                        className={[
                            pillClasses.button,
                            isRequirementUnmet
                                ? pillClasses.requirementUnmet
                                : '',
                            isOrphaned ? pillClasses.inactiveFilter : '',
                            isSelected ? classes.selectedPill : '',
                            isDraft ? classes.draftPill : '',
                        ].join(' ')}
                        pr={truncated.hasMore ? 6 : undefined}
                        leftSection={
                            (isDraggable || showRequirementIcon) && (
                                <Group gap={2} wrap="nowrap">
                                    {isDraggable && (
                                        <MantineIcon
                                            icon={IconGripVertical}
                                            cursor="grab"
                                            size="sm"
                                        />
                                    )}
                                    {showRequirementIcon && (
                                        <Tooltip
                                            fz="xs"
                                            label={requirementTooltip}
                                            disabled={!isRequirementUnmet}
                                        >
                                            <MantineIcon
                                                icon={IconAsterisk}
                                                size="sm"
                                                color={
                                                    isRequirementUnmet
                                                        ? 'yellow.7'
                                                        : 'ldGray.6'
                                                }
                                            />
                                        </Tooltip>
                                    )}
                                </Group>
                            )
                        }
                        rightSection={
                            !isSidebarOpen && (
                                <Group gap={2} wrap="nowrap">
                                    {lockKey && (
                                        <Box
                                            component="span"
                                            className={
                                                isLocked
                                                    ? pillClasses.lockSlotActive
                                                    : pillClasses.lockSlot
                                            }
                                        >
                                            <Tooltip fz="xs" label={lockLabel}>
                                                <ActionIcon
                                                    size="xs"
                                                    radius="xl"
                                                    aria-label={lockLabel}
                                                    aria-pressed={isLocked}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleLock();
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
                                </Group>
                            )
                        }
                        onClick={() => open(filter.id)}
                    >
                        <FilterRuleLabel
                            filterRule={filter}
                            field={field}
                            truncatedValuesDisplay={truncated}
                            isTablesTooltipDisabled={isSelected}
                        />
                    </Button>
                </Box>
            </Tooltip>
        );
    },
);
FilterPill.displayName = 'FilterPill';
