import {
    applyDefaultTileTargets,
    DashboardFilterRule,
    FilterableField,
} from '@lightdash/common';
import { Button, CloseButton, Popover, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FC, useCallback, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
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

    const defaultFilterRule = filterableFieldsByTileUuid
        ? applyDefaultTileTargets(filterRule, field, filterableFieldsByTileUuid)
        : undefined;

    const [isPopoverOpen, { close: closePopover, toggle: togglePopover }] =
        useDisclosure();
    const [isSubPopoverOpen, { close: closeSubPopover, open: openSubPopover }] =
        useDisclosure();

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);

    const handleSetDraftFilterRule = (newRule?: DashboardFilterRule) =>
        setDraftFilterRule(newRule);

    const handleClose = useCallback(() => {
        closeSubPopover();
        closePopover();
        setDraftFilterRule(defaultFilterRule);
    }, [closeSubPopover, closePopover, defaultFilterRule, setDraftFilterRule]);

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
            transitionProps={{ transition: 'pop' }}
            onClose={() => {
                handleClose();
            }}
            offset={-1}
            keepMounted
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant={isTemporary ? 'outline' : 'default'}
                    bg="white"
                    mr="xxs"
                    rightIcon={
                        (isEditMode || isTemporary) && (
                            <CloseButton size="sm" onClick={onRemove} />
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
                        <Tooltip
                            withinPortal
                            position="top-start"
                            disabled={isPopoverOpen}
                            offset={8}
                            label={
                                <Text fz="xs">
                                    {filterRuleTables.length === 0 ? (
                                        <>
                                            Table:
                                            <Text span fw={600}>
                                                {filterRuleTables[0]}
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            Tables:{' '}
                                            <Text span fw={600}>
                                                {filterRuleTables.join(', ')}
                                            </Text>
                                        </>
                                    )}
                                </Text>
                            }
                        >
                            <Text fw={600} span>
                                {filterRule.label || filterRuleLabels.field}{' '}
                            </Text>
                        </Tooltip>
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
            </Popover.Target>

            <Popover.Dropdown>
                <FilterConfiguration
                    isEditMode={isEditMode}
                    isTemporary={isTemporary}
                    tiles={dashboardTiles}
                    field={field}
                    availableTileFilters={filterableFieldsByTileUuid}
                    originalFilterRule={originalFilterRule}
                    draftFilterRule={draftFilterRule}
                    onChangeDraftFilterRule={handleSetDraftFilterRule}
                    onSave={(dashboardFilterRule) => {
                        closeSubPopover();
                        closePopover();
                        onUpdate(dashboardFilterRule);
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
