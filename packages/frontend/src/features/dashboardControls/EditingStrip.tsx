import { type DashboardFilterRule } from '@lightdash/common';
import { Divider, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { formatTileCount } from './fieldLabels';
import { FilterTypeIcon } from './FilterRow';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';

const TileCount: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const count = useAppliedTileCount(rule);
    const getUiString = useUiStrings();
    return (
        <Text span fz="sm" c="dimmed">
            {` · ${formatTileCount(getUiString, count)}`}
        </Text>
    );
};

const EditedFilter: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const emptiedFieldLabel = useControlsSidebarSelector(
        (c) => c.emptiedFieldLabel,
    );
    const field = useFilterRuleField(rule);
    const getUiString = useUiStrings();
    // The rail's names: the label, else the field's or column's name
    const name = isPlaceholder
        ? isNew
            ? getUiString('filters.rail.newFilter')
            : (rule.label ??
              emptiedFieldLabel ??
              getUiString('filters.rail.filterName'))
        : (rule.label ??
          field?.label ??
          (rule.target.isSqlColumn
              ? rule.target.fieldId
              : getUiString('filters.rail.filterName')));
    return (
        <>
            <Divider orientation="vertical" />
            <Group gap="xs" wrap="nowrap" miw={0}>
                <FilterTypeIcon field={field} />
                <Text fz="sm">
                    <Text span inherit fw={600}>
                        {name}
                    </Text>
                    {!isPlaceholder && <TileCount rule={rule} />}
                </Text>
            </Group>
        </>
    );
};

// The bar while the rail is open: what is being edited, nothing to press
export const EditingStrip: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const getUiString = useUiStrings();
    return (
        <Group gap="xs" mih={30} wrap="wrap" role="status">
            <Text fz="sm" fw={600}>
                {getUiString('filters.rail.editingFilters')}
            </Text>
            {editingRule !== null && <EditedFilter rule={editingRule} />}
        </Group>
    );
};
