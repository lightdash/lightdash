import {
    applyDefaultTileTargets,
    ConditionalRuleLabels,
    DashboardFilterRule,
    DashboardTileTypes,
    FilterableField,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconFilter, IconX } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import { useDashboardContext } from '../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../common/Filters/configs';
import MantineIcon from '../common/MantineIcon';
import FilterConfiguration from './FilterConfiguration';

const ActiveFilterButton = ({
    isTemporary,
    isEditMode,
    filterRule,
    filterRuleLabels,
    filterRuleTables = [],
    onRemove = () => {},
    isPopoverOpen,
    togglePopover,
}: {
    isTemporary?: boolean;
    isEditMode: boolean;
    filterRule?: DashboardFilterRule;
    filterRuleLabels?: ConditionalRuleLabels;
    filterRuleTables?: string[];
    onRemove?: () => void;
    isPopoverOpen?: boolean;
    togglePopover: () => void;
}) => (
    <Tooltip
        position="top-start"
        disabled={isPopoverOpen}
        label={
            <Text fs="xs">
                {filterRuleTables.length === 0
                    ? `Table: ${filterRuleTables[0]}`
                    : `Tables: ${filterRuleTables.join(', ')}`}
            </Text>
        }
    >
        <Button
            size="xs"
            variant={isTemporary ? 'outline' : 'default'}
            bg="white"
            mr="xxs"
            rightIcon={
                (isEditMode || isTemporary) && (
                    <ActionIcon color="dark" size="xs" onClick={onRemove}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )
            }
            styles={{
                inner: {
                    color: 'black',
                },
            }}
            onClick={togglePopover}
        >
            <Text fz="xs">
                <Text fw={600} span>
                    {filterRule?.label || filterRuleLabels?.field}{' '}
                </Text>
                <Text fw={400} span>
                    {filterRule?.disabled ? (
                        <Text span color="gray.6">
                            is any value
                        </Text>
                    ) : (
                        <>
                            <Text span color="gray.7">
                                {filterRuleLabels?.operator}{' '}
                            </Text>
                            <Text fw={700} span>
                                {filterRuleLabels?.value}
                            </Text>
                        </>
                    )}
                </Text>
            </Text>
        </Button>
    </Tooltip>
);

type Props = {
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    field?: FilterableField;
    filterRule?: DashboardFilterRule;
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
    onSave,
    onUpdate,
    onRemove,
}) => {
    // TODO should this be only at the root
    const {
        dashboard,
        dashboardTiles,
        allFilterableFields,
        filterableFieldsByTileUuid,
    } = useDashboardContext();

    const [isPopoverOpen, { close: closePopover, toggle: togglePopover }] =
        useDisclosure();
    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const defaultFilterRule =
        filterableFieldsByTileUuid && filterRule && field
            ? applyDefaultTileTargets(
                  filterRule,
                  field,
                  filterableFieldsByTileUuid,
              )
            : undefined;

    // TODO: only used by active
    const originalFilterRule = dashboard?.filters?.dimensions.find(
        (item) => filterRule && item.id === filterRule.id,
    );

    //TODO only used by Add
    const hasChartTiles =
        dashboardTiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        ).length >= 1;

    const filterRuleLabels =
        filterRule && field
            ? getConditionalRuleLabel(filterRule, field)
            : undefined;
    const filterRuleTables =
        filterRule && field && allFilterableFields
            ? getFilterRuleTables(filterRule, field, allFilterableFields)
            : undefined;

    const handleClose = useCallback(() => {
        closeSubPopover();
        closePopover();
    }, [closeSubPopover, closePopover]);

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

    if (!filterableFieldsByTileUuid || !allFilterableFields) {
        return null;
    }

    return (
        <Popover
            position="bottom-start"
            trapFocus
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            disabled={!hasChartTiles}
            transitionProps={{
                transition: 'pop',
            }}
            withArrow
            shadow="md"
            offset={-1}
        >
            <Popover.Target>
                {isCreatingNew ? (
                    <Tooltip
                        disabled={isPopoverOpen || isEditMode}
                        position="bottom"
                        openDelay={500}
                        label={
                            <Text fz="xs">
                                Only filters added in <b>'edit'</b> mode will be
                                saved
                            </Text>
                        }
                    >
                        <Button
                            size="xs"
                            variant="default"
                            leftIcon={
                                <MantineIcon color="blue" icon={IconFilter} />
                            }
                            disabled={!hasChartTiles}
                            onClick={togglePopover}
                        >
                            Add filter
                        </Button>
                    </Tooltip>
                ) : (
                    <Box>
                        <ActiveFilterButton
                            isTemporary={isTemporary}
                            isEditMode={isEditMode}
                            filterRule={filterRule}
                            filterRuleLabels={filterRuleLabels}
                            filterRuleTables={filterRuleTables}
                            onRemove={onRemove}
                            isPopoverOpen={isPopoverOpen}
                            togglePopover={togglePopover}
                        />
                    </Box>
                )}
            </Popover.Target>

            <Popover.Dropdown ml={5}>
                {/* {filterableFieldsByTileUuid ? ( // TODO: This isn't great anyway */}
                <FilterConfiguration
                    isCreatingNew={isCreatingNew}
                    isEditMode={isEditMode}
                    isTemporary={isTemporary}
                    field={field}
                    fields={allFilterableFields || []}
                    tiles={dashboardTiles}
                    originalFilterRule={originalFilterRule}
                    availableTileFilters={filterableFieldsByTileUuid}
                    defaultFilterRule={defaultFilterRule}
                    onSave={handelSaveChanges}
                    // FIXME: remove this once we migrate off of Blueprint
                    popoverProps={{
                        onOpened: () => openSubPopover(),
                        onOpening: () => openSubPopover(),
                        onClose: () => closeSubPopover(),
                        onClosing: () => closeSubPopover(),
                    }}
                />
                {/* ) : null} */}
            </Popover.Dropdown>
        </Popover>
    );
};

export default Filter;
