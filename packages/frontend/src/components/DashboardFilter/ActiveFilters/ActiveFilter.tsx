import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { ActionIcon, Button, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
import MantineIcon from '../../common/MantineIcon';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';
import { FilterModalContainer } from '../FilterSearch/FilterSearch.styles';

type Props = {
    isEditMode: boolean;
    isTemporary?: boolean;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
    isTemporary?: boolean;
};

const ActiveFilter: FC<Props> = ({
    isEditMode,
    isTemporary,
    field,
    filterRule,
    onRemove,
    onUpdate,
    isTemporary = false,
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

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

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
        >
            <Popover.Target>
                <Tooltip
                    position="bottom"
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
                                        {filterRuleLabels.operator}{' '}
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

            {/* FIXME: remove p={0} once we remove Blueprint popover from FilterSearch */}
            <Popover.Dropdown p={0}>
                <FilterModalContainer $wide={selectedTabId === 'tiles'}>
                    <FilterConfiguration
                        isEditMode={isEditMode}
                        isTemporary={isTemporary}
                        tiles={dashboardTiles}
                        selectedTabId={selectedTabId}
                        field={field}
                        availableTileFilters={filterableFieldsByTileUuid}
                        originalFilterRule={originalFilterRule}
                        filterRule={filterRule}
                        onTabChange={setSelectedTabId}
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
                </FilterModalContainer>
            </Popover.Dropdown>
        </Popover>
    );
};

export default ActiveFilter;
