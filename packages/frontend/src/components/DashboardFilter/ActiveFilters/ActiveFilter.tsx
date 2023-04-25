import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { Box, Button, Popover, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
import MantineIcon from '../../common/MantineIcon';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';

type Props = {
    isEditMode: boolean;
    fieldId: string;
    field: FilterableField | undefined;
    filterRule: DashboardFilterRule;
    onClick?: () => void;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
};

const ActiveFilter: FC<Props> = ({
    isEditMode,
    fieldId,
    field,
    filterRule,
    onClick,
    onRemove,
    onUpdate,
}) => {
    const { dashboardTiles, allFilterableFields, filterableFieldsByTileUuid } =
        useDashboardContext();

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (!filterableFieldsByTileUuid || !allFilterableFields) return null;

    if (!field) {
        return (
            <Button
                compact
                color="red"
                px="xs"
                size="xs"
                rightIcon={
                    <MantineIcon onClick={onRemove} icon={IconX} size="sm" />
                }
            >
                Tried to reference field with unknown id:{' '}
                <Text component="span" fw={700}>
                    {fieldId}
                </Text>
            </Button>
        );
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
            shadow="lg"
            withArrow
            trapFocus
            arrowSize={14}
            arrowOffset={10}
        >
            <Popover.Dropdown>
                <Box w={selectedTabId === FilterTabs.TILES ? 500 : 350} p="xs">
                    <FilterConfiguration
                        isEditMode={isEditMode}
                        tiles={dashboardTiles}
                        selectedTabId={selectedTabId}
                        onTabChange={setSelectedTabId}
                        field={field}
                        availableTileFilters={filterableFieldsByTileUuid}
                        filterRule={filterRule}
                        onSave={onUpdate}
                    />
                </Box>
            </Popover.Dropdown>

            <Popover.Target>
                <Button
                    variant="filled"
                    color="gray.7"
                    px="xs"
                    compact
                    size="xs"
                    rightIcon={
                        <MantineIcon
                            onClick={onRemove}
                            icon={IconX}
                            size="sm"
                        />
                    }
                    onClick={onClick}
                >
                    <Tooltip
                        withinPortal
                        withArrow
                        position="top-start"
                        label={
                            filterRuleTables.length === 0
                                ? `Table: ${filterRuleTables[0]}`
                                : `Tables: ${filterRuleTables.join(', ')}`
                        }
                    >
                        <Text component="span">
                            {filterRule.label || filterRuleLabels.field}:{' '}
                            {filterRuleLabels.operator}{' '}
                            <Text component="span" fw={700}>
                                {filterRuleLabels.value}
                            </Text>
                        </Text>
                    </Tooltip>
                </Button>
            </Popover.Target>
        </Popover>
    );
};

export default ActiveFilter;
