import {
    applyDefaultTileTargets,
    DimensionType,
    getFilterTypeFromItemType,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Indicator,
    Popover,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure, useId } from '@mantine-8/hooks';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import {
    formatDisplayValue,
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterRuleTables,
} from '../../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import FilterConfiguration from '../FilterConfiguration';
import { hasFilterValueSet } from '../FilterConfiguration/utils';
import classes from './Filter.module.css';

type Props = {
    isEditMode: boolean;
    isOrphaned: boolean;
    orphanedTooltip?: string;
    isTemporary?: boolean;
    field: FilterableDimension | undefined;
    filterRule: DashboardFilterRule;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onUpdate: (filter: DashboardFilterRule) => void;
    onRemove: () => void;
};

const Filter: FC<Props> = ({
    isEditMode,
    isOrphaned,
    orphanedTooltip = 'This filter is not applied to any tiles',
    isTemporary,
    field,
    filterRule,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    onUpdate,
    onRemove,
}) => {
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

    // Truncated values display - show max 2 values with "+N" badge
    const MAX_DISPLAYED_VALUES = 2;
    const truncatedValuesDisplay = useMemo(() => {
        const values = filterRule.values;
        if (!values || values.length === 0) {
            return {
                displayedValues: [],
                additionalValues: [],
                hasMore: false,
            };
        }

        const formattedValues = values.map((v) =>
            formatDisplayValue(String(v)),
        );
        const displayedValues = formattedValues.slice(0, MAX_DISPLAYED_VALUES);
        const additionalValues = formattedValues.slice(MAX_DISPLAYED_VALUES);

        return {
            displayedValues,
            additionalValues,
            hasMore: additionalValues.length > 0,
        };
    }, [filterRule.values]);

    const hasUnsetRequiredFilter =
        filterRule.required && !hasFilterValueSet(filterRule);

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
                onDismiss={!isSubPopoverOpen ? handleClose : undefined}
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
                        classNames={{
                            indicator: classes.indicator,
                        }}
                        position="top-start"
                        disabled={!hasUnsetRequiredFilter}
                        label={
                            <Tooltip
                                fz="xs"
                                label="Set a value to run this dashboard"
                            >
                                <Text fz="10px" fw={500}>
                                    Required
                                </Text>
                            </Tooltip>
                        }
                    >
                        <Tooltip
                            fz="xs"
                            label={orphanedTooltip}
                            disabled={!isOrphaned}
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
                                classNames={{
                                    label: classes.label,
                                }}
                                className={`${classes.button} ${
                                    hasUnsetRequiredFilter
                                        ? classes.unsetRequiredFilter
                                        : ''
                                } ${isOrphaned ? classes.inactiveFilter : ''}`}
                                pr={
                                    truncatedValuesDisplay.hasMore
                                        ? 6
                                        : undefined
                                }
                                leftSection={
                                    isDraggable && (
                                        <MantineIcon
                                            icon={IconGripVertical}
                                            cursor="grab"
                                            size="sm"
                                        />
                                    )
                                }
                                rightSection={
                                    (isEditMode || isTemporary) && (
                                        <ActionIcon
                                            onClick={onRemove}
                                            size="xs"
                                            color="dark"
                                            radius="xl"
                                            variant="subtle"
                                        >
                                            <MantineIcon
                                                size="sm"
                                                icon={IconX}
                                            />
                                        </ActionIcon>
                                    )
                                }
                                onClick={() =>
                                    isPopoverOpen
                                        ? handleClose()
                                        : onPopoverOpen(popoverId)
                                }
                            >
                                <Box
                                    style={{
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
                                                <Text fz="inherit">
                                                    {filterRuleTables?.length ===
                                                    1
                                                        ? 'Table: '
                                                        : 'Tables: '}
                                                    <Text
                                                        span
                                                        fw={600}
                                                        fz="inherit"
                                                    >
                                                        {filterRuleTables?.join(
                                                            ', ',
                                                        )}
                                                    </Text>
                                                </Text>
                                            }
                                        >
                                            <Text
                                                fz="inherit"
                                                fw={600}
                                                span
                                                truncate
                                            >
                                                {filterRule?.label ||
                                                    filterRuleLabels?.field}{' '}
                                            </Text>
                                        </Tooltip>
                                        {filterRule?.disabled ? (
                                            <Text
                                                span
                                                fz="inherit"
                                                c="ldGray.6"
                                                truncate
                                            >
                                                is any value
                                            </Text>
                                        ) : (
                                            <>
                                                <Text
                                                    span
                                                    fz="inherit"
                                                    c="dimmed"
                                                    truncate
                                                >
                                                    {filterRuleLabels?.operator}{' '}
                                                </Text>
                                                <Text
                                                    fw={500}
                                                    fz="inherit"
                                                    span
                                                    truncate
                                                >
                                                    {truncatedValuesDisplay
                                                        .displayedValues
                                                        .length > 0
                                                        ? truncatedValuesDisplay.displayedValues.join(
                                                              ', ',
                                                          )
                                                        : filterRuleLabels?.value}
                                                </Text>
                                                {truncatedValuesDisplay.hasMore && (
                                                    <Tooltip
                                                        withinPortal
                                                        position="bottom"
                                                        label={
                                                            <Box>
                                                                <Text
                                                                    fz="xs"
                                                                    fw={500}
                                                                    c="dimmed"
                                                                >
                                                                    Additional
                                                                    values (
                                                                    {
                                                                        truncatedValuesDisplay
                                                                            .additionalValues
                                                                            .length
                                                                    }
                                                                    )
                                                                </Text>
                                                                {truncatedValuesDisplay.additionalValues.map(
                                                                    (
                                                                        val,
                                                                        idx,
                                                                    ) => (
                                                                        <Text
                                                                            key={
                                                                                idx
                                                                            }
                                                                            fz="xs"
                                                                        >
                                                                            •{' '}
                                                                            {
                                                                                val
                                                                            }
                                                                        </Text>
                                                                    ),
                                                                )}
                                                            </Box>
                                                        }
                                                    >
                                                        <Badge
                                                            size="sm"
                                                            variant="light"
                                                            color="gray"
                                                            ml={4}
                                                        >
                                                            +
                                                            {
                                                                truncatedValuesDisplay
                                                                    .additionalValues
                                                                    .length
                                                            }
                                                        </Badge>
                                                    </Tooltip>
                                                )}
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
