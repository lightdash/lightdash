import {
    applyDefaultTileTargets,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type FilterableItem,
    type WeekDay,
} from '@lightdash/common';
import { Button, Group, Popover, Stack, Text } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconLock,
} from '@tabler/icons-react';
import { Fragment, useCallback, useMemo, type FC } from 'react';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import FilterConfiguration from '../FilterConfiguration';
import classes from './RequiredFiltersBanner.module.css';
import { getDashboardFilterRuleLabel } from './utils';

type BannerFilterChipProps = {
    filterRule: DashboardFilterRule;
    isEditMode: boolean;
};

const BannerFilterChip: FC<BannerFilterChipProps> = ({
    filterRule,
    isEditMode,
}) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );

    const [isPopoverOpen, { open: openPopover, close: closePopover }] =
        useDisclosure(false);
    const [isSubPopoverOpen, { open: openSubPopover, close: closeSubPopover }] =
        useDisclosure(false);

    const field: DashboardFilterableField | undefined =
        allFilterableFieldsMap[filterRule.target.fieldId] ??
        allFilterableMetricsMap[filterRule.target.fieldId];

    const fieldsMap = useMemo<Record<string, FilterableItem>>(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const label = getDashboardFilterRuleLabel(filterRule, fieldsMap);

    const defaultFilterRule = useMemo(() => {
        if (filterableFieldsByTileUuid && field) {
            return applyDefaultTileTargets(
                filterRule,
                field,
                filterableFieldsByTileUuid,
            );
        }
        return filterRule;
    }, [filterableFieldsByTileUuid, field, filterRule]);

    const originalFilterRule = useMemo(
        () =>
            dashboard?.filters.dimensions.find(
                (item) => item.id === filterRule.id,
            ) ??
            dashboard?.filters.metrics.find(
                (item) => item.id === filterRule.id,
            ),
        [dashboard, filterRule.id],
    );

    const handleClose = useCallback(() => {
        closePopover();
        closeSubPopover();
    }, [closePopover, closeSubPopover]);

    const handleSave = useCallback(
        (newRule: DashboardFilterRule) => {
            const dimensionIndex = dashboardFilters.dimensions.findIndex(
                (item) => item.id === newRule.id,
            );
            if (dimensionIndex >= 0) {
                updateDimensionDashboardFilter(
                    newRule,
                    dimensionIndex,
                    false,
                    isEditMode,
                );
            } else {
                const metricIndex = dashboardFilters.metrics.findIndex(
                    (item) => item.id === newRule.id,
                );
                if (metricIndex >= 0) {
                    updateMetricDashboardFilter(
                        newRule,
                        metricIndex,
                        false,
                        isEditMode,
                    );
                }
            }
            handleClose();
        },
        [
            dashboardFilters,
            updateDimensionDashboardFilter,
            updateMetricDashboardFilter,
            isEditMode,
            handleClose,
        ],
    );

    return (
        <Popover
            position="bottom-start"
            trapFocus
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            onDismiss={!isSubPopoverOpen ? handleClose : undefined}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            shadow="md"
            withinPortal
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    className={classes.bannerChip}
                    leftSection={
                        <MantineIcon
                            icon={IconLock}
                            size="sm"
                            color="yellow.7"
                        />
                    }
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size="sm" />
                    }
                    onClick={() =>
                        isPopoverOpen ? handleClose() : openPopover()
                    }
                >
                    {label}
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                {dashboardTiles && (
                    <FilterConfiguration
                        isCreatingNew={false}
                        isEditMode={isEditMode}
                        field={field}
                        fields={allFilterableFields || []}
                        tiles={dashboardTiles}
                        tabs={dashboardTabs ?? []}
                        originalFilterRule={originalFilterRule}
                        availableTileFilters={filterableFieldsByTileUuid ?? {}}
                        defaultFilterRule={defaultFilterRule}
                        onSave={handleSave}
                        popoverProps={{
                            onOpen: openSubPopover,
                            onClose: closeSubPopover,
                        }}
                    />
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

type RequiredFiltersBannerProps = {
    isEditMode: boolean;
    startOfWeek?: WeekDay;
};

/**
 * Full-width amber banner shown below the filter bar while filter
 * requirements are unmet. Each chip opens a value picker for that filter.
 */
const RequiredFiltersBanner: FC<RequiredFiltersBannerProps> = ({
    isEditMode,
    startOfWeek,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const unmetFilterRequirements = useDashboardContext(
        (c) => c.unmetFilterRequirements,
    );

    const unmetSingles = useMemo(
        () =>
            unmetFilterRequirements.flatMap((requirement) =>
                requirement.type === 'single' ? [requirement.filter] : [],
            ),
        [unmetFilterRequirements],
    );
    const unmetGroups = useMemo(
        () =>
            unmetFilterRequirements.flatMap((requirement) =>
                requirement.type === 'group' ? [requirement] : [],
            ),
        [unmetFilterRequirements],
    );

    if (unmetFilterRequirements.length === 0) return null;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={startOfWeek}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTab?.uuid}
        >
            <Stack gap="xs" className={classes.banner}>
                {unmetSingles.length > 0 && (
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="yellow.7"
                        />
                        <Text size="sm" fw={500}>
                            {unmetSingles.length === 1
                                ? 'Pick a value for this required filter to load data:'
                                : 'Pick a value for these required filters to load data:'}
                        </Text>
                        {unmetSingles.map((filter, index) => (
                            <Fragment key={filter.id}>
                                {index > 0 && (
                                    <Text size="xs" c="ldGray.6">
                                        and
                                    </Text>
                                )}
                                <BannerFilterChip
                                    filterRule={filter}
                                    isEditMode={isEditMode}
                                />
                            </Fragment>
                        ))}
                    </Group>
                )}
                {unmetGroups.map((group) => (
                    <Group key={group.groupId} gap="xs">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="yellow.7"
                        />
                        <Text size="sm" fw={500}>
                            Pick a value for at least one of these required
                            filters to load data:
                        </Text>
                        {group.filters.map((filter, index) => (
                            <Fragment key={filter.id}>
                                {index > 0 && (
                                    <Text size="xs" c="ldGray.6">
                                        or
                                    </Text>
                                )}
                                <BannerFilterChip
                                    filterRule={filter}
                                    isEditMode={isEditMode}
                                />
                            </Fragment>
                        ))}
                    </Group>
                ))}
            </Stack>
        </FiltersProvider>
    );
};

export default RequiredFiltersBanner;
