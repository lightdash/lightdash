import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { ActionIcon, Button, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { FC, useCallback } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
import MantineIcon from '../../common/MantineIcon';
import FilterConfiguration from '../FilterConfiguration';

type Props = {
    isEditMode: boolean;
    isTemporary?: boolean;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
};

const ActiveFilter: FC<Props> = ({
    isEditMode,
    isTemporary,
    field,
    filterRule,
    onRemove,
    onUpdate,
}) => {
    const {
        dashboard,
        dashboardTiles,
        allFilterableFields,
        filterableFieldsByTileUuid,
    } = useDashboardContext();

    const originalFilterRule = dashboard?.filters?.dimensions.find(
        (item) => item.id === filterRule.id,
    );

    const [isPopoverOpen, { close: closePopover, toggle: togglePopover }] =
        useDisclosure();
    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const handleClose = useCallback(() => {
        closeSubPopover();
        closePopover();
    }, [closeSubPopover, closePopover]);

    if (!filterableFieldsByTileUuid || !allFilterableFields) {
        return null;
    }

    const filterRuleLabels = getConditionalRuleLabel(filterRule, field);
    const filterRuleTables = getFilterRuleTables(
        filterRule,
        field,
        allFilterableFields,
    );

    return (
        <Popover
            position="bottom-start"
            withArrow
            shadow="md"
            opened={isPopoverOpen}
            closeOnEscape={!isSubPopoverOpen}
            closeOnClickOutside={!isSubPopoverOpen}
            onClose={handleClose}
            offset={-1}
            keepMounted
        >
            <Popover.Target>
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
                        rightIcon={
                            (isEditMode || isTemporary) && (
                                <ActionIcon
                                    color="dark"
                                    size="xs"
                                    onClick={onRemove}
                                >
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
                                {filterRule.label || filterRuleLabels.field}{' '}
                            </Text>
                            <Text fw={400} span>
                                {filterRule.disabled ? (
                                    <Text span color="gray.6">
                                        is any value
                                    </Text>
                                ) : (
                                    <>
                                        <Text span color="gray.7">
                                            {filterRuleLabels.operator}{' '}
                                        </Text>
                                        <Text fw={700} span>
                                            {filterRuleLabels.value}
                                        </Text>
                                    </>
                                )}
                            </Text>
                        </Text>
                    </Button>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown>
                <FilterConfiguration
                    isEditMode={isEditMode}
                    isTemporary={isTemporary}
                    tiles={dashboardTiles}
                    field={field}
                    availableTileFilters={filterableFieldsByTileUuid}
                    originalFilterRule={originalFilterRule}
                    filterRule={filterRule}
                    onSave={(dashboardFilterRule) => {
                        onUpdate(dashboardFilterRule);
                        handleClose();
                    }}
                    // FIXME: remove this once we migrate off of Blueprint
                    popoverProps={{
                        onOpened: () => openSubPopover(),
                        onOpening: () => openSubPopover(),
                        onClose: () => closeSubPopover(),
                        onClosing: () => closeSubPopover(),
                    }}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default ActiveFilter;
