import { type DashboardFilterRule } from '@lightdash/common';
import { Divider, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { formatTileCount } from './fieldLabels';
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

// Shown once the filter has a field: before that the rail says it all
const EditedFilter: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const field = useFilterRuleField(rule);
    const getUiString = useUiStrings();
    // The rail's names: the label, else the field's or column's name
    const name =
        rule.label ??
        field?.label ??
        (rule.target.isSqlColumn
            ? rule.target.fieldId
            : getUiString('filters.rail.filterName'));
    return (
        <>
            <Divider orientation="vertical" />
            <Text fz="sm">
                <Text span inherit fw={600}>
                    {name}
                </Text>
                <TileCount rule={rule} />
            </Text>
        </>
    );
};

// The bar while the rail is open: what is being edited, nothing to press
export const EditingStrip: FC = () => {
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const getUiString = useUiStrings();
    return (
        <Group gap="xs" mih={30} wrap="wrap" role="status">
            <Text fz="sm" fw={600}>
                {getUiString('filters.rail.editingFilters')}
            </Text>
            {editingRule !== null && !isPlaceholder && (
                <EditedFilter rule={editingRule} />
            )}
        </Group>
    );
};
