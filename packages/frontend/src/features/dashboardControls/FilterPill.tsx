import {
    isEmptyDashboardFilterRule,
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    HoverCard,
    ScrollArea,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAsterisk,
    IconGripVertical,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { getTruncatedValuesDisplay } from '../dashboardFilters/ActiveFilters/utils';
import { useFilterChipRequirementState } from '../dashboardFilters/FilterRequirements/useFilterChipRequirementState';
import classes from './FilterPills.module.css';
import { getFilterPillLabels, showsComposedValue } from './pillState';
import {
    isPlaceholderRule,
    replaceFilterRule,
    toggleFilterLockOnTab,
} from './sidebarState';
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
    /** The tab uuid, or the dashboard uuid when there are no tabs. */
    lockKey: string | undefined;
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
        lockKey,
        hasTabs,
        dashboardUuid,
    }) => {
        const getUiString = useUiStrings();
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
        const sqlChartTilesMetadata = useDashboardTileStatusContext(
            (c) => c.sqlChartTilesMetadata,
        );
        const { showRequirementIcon, isRequirementUnmet, requirementTooltip } =
            useFilterChipRequirementState(filter);

        const labels = useMemo(
            () =>
                getFilterPillLabels(
                    filter,
                    field,
                    sqlChartTilesMetadata,
                    getUiString,
                ),
            [filter, field, sqlChartTilesMetadata, getUiString],
        );
        const truncated = useMemo(
            () =>
                getTruncatedValuesDisplay(
                    filter.values,
                    showsComposedValue(filter, field),
                    filter.operator,
                ),
            [filter, field],
        );

        // An unnamed filter reads as its field, like its editor's title
        const name = filter.label || labels.field || 'Filter';
        const hasNoField = isPlaceholderRule(filter);
        const isAnyValue =
            filter.disabled ||
            (!filter.required && isEmptyDashboardFilterRule(filter));
        const isLocked =
            !!lockKey && isFilterLockedOnTab(filter, lockKey, hasTabs);
        const lockLabel = `${isLocked ? 'Unlock' : 'Lock'} filter${hasTabs ? ' on this tab' : ''}`;

        const toggleLock = (key: string) => {
            track({
                name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                properties: {
                    action: isLocked ? 'unlock' : 'lock',
                    dashboardUuid,
                    tabUuid: hasTabs ? key : undefined,
                    fieldId: filter.target.fieldId,
                    tableName: filter.target.tableName,
                },
            });
            setDashboardFilters((filters) =>
                replaceFilterRule(
                    filters,
                    toggleFilterLockOnTab(filter, key, hasTabs),
                ),
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
                                                        toggleLock(lockKey);
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
                        <Text fz="inherit" span>
                            <Text fw={600} span>
                                {name}
                            </Text>{' '}
                            {hasNoField ? null : isAnyValue ? (
                                <Text span c="dimmed">
                                    {getUiString('filters.isAnyValue')}
                                </Text>
                            ) : (
                                <>
                                    <Text span c="dimmed">
                                        {labels.operator}
                                    </Text>{' '}
                                    <Text fw={500} span>
                                        {truncated.displayedValues.length > 0
                                            ? truncated.displayedValues.join(
                                                  ', ',
                                              )
                                            : labels.value}
                                    </Text>
                                    {truncated.hasMore && (
                                        <HoverCard
                                            position="bottom"
                                            classNames={{
                                                dropdown:
                                                    pillClasses.additionalValuesList,
                                            }}
                                        >
                                            <HoverCard.Target>
                                                <Badge size="sm" ml={4}>
                                                    +
                                                    {
                                                        truncated
                                                            .additionalValues
                                                            .length
                                                    }
                                                </Badge>
                                            </HoverCard.Target>
                                            <HoverCard.Dropdown>
                                                <Text
                                                    fz="xs"
                                                    fw={500}
                                                    c="ldGray.5"
                                                >
                                                    Additional values (
                                                    {
                                                        truncated
                                                            .additionalValues
                                                            .length
                                                    }
                                                    )
                                                </Text>
                                                <ScrollArea.Autosize
                                                    mah={200}
                                                    type="always"
                                                    scrollbars="y"
                                                >
                                                    {truncated.additionalValues.map(
                                                        (value, index) => (
                                                            <Text
                                                                key={index}
                                                                fz="xs"
                                                                c="white"
                                                            >
                                                                • {value}
                                                            </Text>
                                                        ),
                                                    )}
                                                </ScrollArea.Autosize>
                                            </HoverCard.Dropdown>
                                        </HoverCard>
                                    )}
                                </>
                            )}
                        </Text>
                    </Button>
                </Box>
            </Tooltip>
        );
    },
);
FilterPill.displayName = 'FilterPill';
