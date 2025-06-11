import {
    applyDefaultTileTargets,
    DimensionType,
    getFilterTypeFromItemType,
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
import { IconGripVertical } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import {
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterRuleTables,
} from '../../common/Filters/FilterInputs/utils';
import MantineIcon from '../../common/MantineIcon';
import FilterConfiguration from '../FilterConfiguration';
import { hasFilterValueSet } from '../FilterConfiguration/utils';

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
        borderColor: theme.fn.rgba(theme.colors.gray[5], 0.7),
        backgroundColor: theme.fn.rgba(theme.white, 0.7),
    },
}));

type Props = {
    isEditMode: boolean;
    isTemporary?: boolean;
    field: FilterableDimension | undefined;
    filterRule: DashboardFilterRule;
    appliesToTabs: String[];
    openPopoverId: string | undefined;
    activeTabUuid: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onUpdate: (filter: DashboardFilterRule) => void;
    onRemove: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isTemporary,
    field,
    filterRule,
    appliesToTabs,
    openPopoverId,
    activeTabUuid,
    onPopoverOpen,
    onPopoverClose,
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
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const disabled = useMemo(() => {
        // Wait for fields to be loaded unless is SQL column
        return !allFilterableFields && !filterRule.target.isSqlColumn;
    }, [allFilterableFields, filterRule]);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const isPopoverOpen = openPopoverId === popoverId;

    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const isDraggable = isEditMode && !isTemporary;

    const defaultFilterRule = useMemo(() => {
        if (filterableFieldsByTileUuid && field) {
            return applyDefaultTileTargets(
                filterRule,
                field,
                filterableFieldsByTileUuid,
            );
        } else {
            return filterRule;
        }
    }, [filterableFieldsByTileUuid, field, filterRule]);

    // Only used by active filters
    const originalFilterRule = useMemo(() => {
        if (!dashboard) return;

        return dashboard.filters.dimensions.find(
            (item) => item.id === filterRule.id,
        );
    }, [dashboard, filterRule]);

    const filterRuleLabels = useMemo(() => {
        if (field) {
            return getConditionalRuleLabelFromItem(filterRule, field);
        } else {
            const column = Object.values(sqlChartTilesMetadata)
                .flatMap((tileMetadata) => tileMetadata.columns)
                .find(
                    ({ reference }) => reference === filterRule.target.fieldId,
                );
            if (column) {
                return getConditionalRuleLabel(
                    filterRule,
                    getFilterTypeFromItemType(column.type),
                    column.reference,
                );
            }
            return getConditionalRuleLabel(
                filterRule,
                getFilterTypeFromItemType(
                    filterRule.target.fallbackType ?? DimensionType.STRING,
                ),
                filterRule.target.fieldId,
            );
        }
    }, [filterRule, field, sqlChartTilesMetadata]);

    const filterRuleTables = useMemo(() => {
        if (!field || !allFilterableFields) return;

        return getFilterRuleTables(filterRule, field, allFilterableFields);
    }, [filterRule, field, allFilterableFields]);

    const hasUnsetRequiredFilter =
        filterRule.required && !hasFilterValueSet(filterRule);

    const inactiveFilterInfo = useMemo(() => {
        if (activeTabUuid && !appliesToTabs.includes(activeTabUuid)) {
            const appliedTabList = appliesToTabs
                .map((tabId) => {
                    return `'${
                        dashboardTabs.find((tab) => tab.uuid === tabId)?.name
                    }'`;
                })
                .join(', ');
            return appliedTabList
                ? `This filter only applies to tab${
                      appliesToTabs.length === 1 ? '' : 's'
                  }: ${appliedTabList}`
                : 'This filter is not currently applied to any tabs';
        }
    }, [activeTabUuid, appliesToTabs, dashboardTabs]);

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
        closeSubPopover();
    }, [isPopoverOpen, onPopoverClose, closeSubPopover]);

    const handleSaveChanges = useCallback(
        (newRule: DashboardFilterRule) => {
            onUpdate(newRule);
            handleClose();
        },
        [onUpdate, handleClose],
    );

    return (
        <>
            <Popover
                position="bottom-start"
                trapFocus
                opened={isPopoverOpen}
                closeOnEscape={!isSubPopoverOpen}
                closeOnClickOutside={!isSubPopoverOpen}
                onClose={handleClose}
                disabled={disabled}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                shadow="md"
                offset={1}
                arrowOffset={14}
                withinPortal
            >
                <Popover.Target>
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
                            withinPortal
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
                </Popover.Target>

                <Popover.Dropdown>
                    {dashboardTiles && (
                        <FilterConfiguration
                            isCreatingNew={false}
                            isEditMode={isEditMode}
                            isTemporary={isTemporary}
                            field={field}
                            fields={allFilterableFields || []}
                            tiles={dashboardTiles}
                            tabs={dashboardTabs}
                            activeTabUuid={activeTabUuid}
                            originalFilterRule={originalFilterRule}
                            availableTileFilters={
                                filterableFieldsByTileUuid ?? {}
                            }
                            defaultFilterRule={defaultFilterRule}
                            onSave={handleSaveChanges}
                            popoverProps={{
                                onOpen: openSubPopover,
                                onClose: closeSubPopover,
                            }}
                        />
                    )}
                </Popover.Dropdown>
            </Popover>
        </>
    );
};

export default Filter;
