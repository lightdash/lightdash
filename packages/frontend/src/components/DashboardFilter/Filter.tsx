import {
    applyDefaultTileTargets,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Button,
    CloseButton,
    createStyles,
    Indicator,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure, useId } from '@mantine/hooks';
import { IconFilter, IconGripVertical } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../common/Filters/FilterInputs';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';
import { hasFilterValueSet } from './FilterConfiguration/utils';

const useDashboardFilterStyles = createStyles((theme) => ({
    root: {
        backgroundColor: 'white',
    },
    unsetRequiredFilter: {
        borderStyle: 'solid',
        borderWidth: '3px',
    },
    inactiveFilter: {
        borderStyle: 'dashed',
        borderWidth: '1px',
        backgroundColor: theme.fn.rgba(theme.white, 0.7),
    },
}));

type Props = {
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    field?: FilterableDimension;
    filterRule?: DashboardFilterRule;
    appliesToTabs?: String[];
    openPopoverId: string | undefined;
    activeTabUuid?: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onSave?: (value: DashboardFilterRule) => void;
    onUpdate?: (filter: DashboardFilterRule) => void;
    onRemove?: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isCreatingNew,
    isTemporary,
    field,
    filterRule,
    appliesToTabs,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
    onSave,
    onUpdate,
    onRemove,
}) => {
    const { classes } = useDashboardFilterStyles();
    const popoverId = useId();

    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const isDraggable = isEditMode && !isTemporary;

    const defaultFilterRule = useMemo(() => {
        if (!filterableFieldsByTileUuid || !field || !filterRule) return;

        return applyDefaultTileTargets(
            filterRule,
            field,
            filterableFieldsByTileUuid,
        );
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard || !filterRule) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const filterRuleLabels = useMemo(() => {
        if (!filterRule || !field) return;

        return getConditionalRuleLabel(filterRule, field);
    }, [filterRule, field]);

    const filterRuleTables = useMemo(() => {
        if (!filterRule || !field || !allFilterableFields) return;

        return getFilterRuleTables(filterRule, field, allFilterableFields);
    }, [filterRule, field, allFilterableFields]);

    const hasUnsetRequiredFilter =
        filterRule?.required && !hasFilterValueSet(filterRule);

    const inactiveFilterInfo = useMemo(() => {
        if (
            activeTabUuid &&
            appliesToTabs &&
            !appliesToTabs.includes(activeTabUuid)
        ) {
            const appliedTabList = appliesToTabs
                .map((tabId) => {
                    return `'${
                        dashboardTabs.find((tab) => tab.uuid === tabId)?.name
                    }'`;
                })
                .join(', ');
            return appliedTabList
                ? `This filter only applies to tabs: ${appliedTabList}`
                : 'This filter is not currently applied to any tabs';
        }
    }, [activeTabUuid, appliesToTabs, dashboardTabs]);

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handelSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            if (isCreatingNew && onSave) {
                onSave(newRule);
            } else if (onUpdate) {
                onUpdate(newRule);
            }
            handleClose();
        },
        [isCreatingNew, onSave, onUpdate, handleClose],
    );

    const isPopoverDisabled =
        !filterableFieldsByTileUuid || !allFilterableFields;

    return (
        <Popover
            position="bottom-start"
            trapFocus
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            disabled={isPopoverDisabled}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
            withinPortal
        >
            <Popover.Target>
                {isCreatingNew ? (
                    <Tooltip
                        disabled={isPopoverOpen || isEditMode}
                        position="top-start"
                        withinPortal
                        offset={0}
                        arrowOffset={16}
                        label={
                            <Text fz="xs">
                                Only filters added in{' '}
                                <Text span fw={600}>
                                    'edit'
                                </Text>{' '}
                                mode will be saved
                            </Text>
                        }
                    >
                        <Button
                            size="xs"
                            variant="default"
                            leftIcon={
                                <MantineIcon color="blue" icon={IconFilter} />
                            }
                            disabled={!allFilterableFields}
                            loading={
                                isLoadingDashboardFilters ||
                                isFetchingDashboardFilters
                            }
                            onClick={() =>
                                isPopoverOpen
                                    ? handleClose()
                                    : onPopoverOpen(popoverId)
                            }
                        >
                            Add filter
                        </Button>
                    </Tooltip>
                ) : (
                    <Indicator
                        inline
                        position="top-end"
                        size={16}
                        disabled={!hasUnsetRequiredFilter}
                        label={
                            <Tooltip
                                fz="xs"
                                label="Set a value to run this dashboard"
                            >
                                <Text fz="9px" fw={500}>
                                    Required
                                </Text>
                            </Tooltip>
                        }
                        styles={(theme) => ({
                            common: {
                                top: -5,
                                right: 24,
                                borderRadius: theme.radius.xs,
                                borderBottomRightRadius: 0,
                                borderBottomLeftRadius: 0,
                            },
                        })}
                    >
                        <Tooltip
                            fz="xs"
                            label={inactiveFilterInfo}
                            disabled={!inactiveFilterInfo}
                        >
                            <Button
                                pos="relative"
                                size="xs"
                                variant={
                                    isTemporary || hasUnsetRequiredFilter
                                        ? 'outline'
                                        : 'default'
                                }
                                className={`${classes.root} ${
                                    hasUnsetRequiredFilter
                                        ? classes.unsetRequiredFilter
                                        : ''
                                } ${
                                    inactiveFilterInfo
                                        ? classes.inactiveFilter
                                        : ''
                                }`}
                                leftIcon={
                                    isDraggable && (
                                        <MantineIcon
                                            icon={IconGripVertical}
                                            color="gray"
                                            cursor="grab"
                                            size="sm"
                                        />
                                    )
                                }
                                rightIcon={
                                    (isEditMode || isTemporary) && (
                                        <CloseButton
                                            size="sm"
                                            onClick={onRemove}
                                        />
                                    )
                                }
                                styles={{
                                    inner: {
                                        color: 'black',
                                    },
                                    label: {
                                        maxWidth: '800px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    },
                                }}
                                onClick={() =>
                                    isPopoverOpen
                                        ? handleClose()
                                        : onPopoverOpen(popoverId)
                                }
                            >
                                <Box
                                    sx={{
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <Text fz="xs" truncate>
                                        <Tooltip
                                            withinPortal
                                            position="top-start"
                                            disabled={
                                                isPopoverOpen ||
                                                !filterRuleTables?.length
                                            }
                                            openDelay={1000}
                                            offset={8}
                                            label={
                                                <Text fz="xs">
                                                    {filterRuleTables?.length ===
                                                    1
                                                        ? 'Table: '
                                                        : 'Tables: '}
                                                    <Text span fw={600}>
                                                        {filterRuleTables?.join(
                                                            ', ',
                                                        )}
                                                    </Text>
                                                </Text>
                                            }
                                        >
                                            <Text fw={600} span truncate>
                                                {filterRule?.label ||
                                                    filterRuleLabels?.field}{' '}
                                            </Text>
                                        </Tooltip>
                                        {filterRule?.disabled ? (
                                            <Text span color="gray.6" truncate>
                                                is any value
                                            </Text>
                                        ) : (
                                            <>
                                                <Text
                                                    span
                                                    color="gray.7"
                                                    truncate
                                                >
                                                    {filterRuleLabels?.operator}{' '}
                                                </Text>
                                                <Text fw={700} span truncate>
                                                    {filterRuleLabels?.value}
                                                </Text>
                                            </>
                                        )}
                                    </Text>
                                </Box>
                            </Button>
                        </Tooltip>
                    </Indicator>
                )}
            </Popover.Target>

            <Popover.Dropdown>
                {filterableFieldsByTileUuid && dashboardTiles && (
                    <FilterConfiguration
                        isCreatingNew={isCreatingNew}
                        isEditMode={isEditMode}
                        isTemporary={isTemporary}
                        field={field}
                        fields={allFilterableFields || []}
                        tiles={dashboardTiles}
                        tabs={dashboardTabs}
                        activeTabUuid={activeTabUuid}
                        originalFilterRule={originalFilterRule}
                        availableTileFilters={filterableFieldsByTileUuid}
                        defaultFilterRule={defaultFilterRule}
                        onSave={handelSaveChanges}
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

export default Filter;
