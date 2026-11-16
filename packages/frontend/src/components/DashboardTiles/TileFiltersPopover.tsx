import {
    interpolateUiString,
    type FilterableField,
    type FilterRule,
} from '@lightdash/common';
import { ActionIcon, Badge, Popover, Stack, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { getConditionalRuleLabelFromItem } from '../common/Filters/FilterInputs/utils';
import MantineIcon from '../common/MantineIcon';
import tileClasses from './DashboardTiles.module.css';
import { TileHeaderPopover } from './TileBase/TileHeaderPopover';

export type TileFilterItem = {
    key: string;
    filterRule: FilterRule;
    /** Undefined when the tile's fields do not have the rule's field */
    field: FilterableField | undefined;
    /** The query the rule was pushed into, on a tile that runs several; null otherwise */
    sourceLabel: string | null;
    isOverridden: boolean;
};

const TileFilterBadge: FC<{
    item: TileFilterItem;
    kind: 'dashboard' | 'chart';
}> = ({ item: { filterRule, field, sourceLabel, isOverridden }, kind }) => {
    const getUiString = useUiStrings();
    if (!field) {
        return (
            <>
                {interpolateUiString(getUiString('tile.filters.unknownField'), {
                    fieldId: filterRule.target.fieldId,
                })}
            </>
        );
    }
    const labels = getConditionalRuleLabelFromItem(
        filterRule,
        field,
        getUiString,
    );
    const td = isOverridden ? 'line-through' : undefined;
    return (
        <Badge
            maw="100%"
            h="auto"
            variant="outline"
            color="ldGray.4"
            size="lg"
            fz="xs"
            fw="normal"
            {...(kind === 'dashboard'
                ? { className: tileClasses.wrapBadge, c: 'black' }
                : {
                      className: tileClasses.overrideBadge,
                      'data-overridden': isOverridden || undefined,
                  })}
        >
            {sourceLabel !== null && (
                <Text span inherit c="dimmed">
                    {sourceLabel} ·{' '}
                </Text>
            )}
            <Text fw={600} span inherit c="foreground" td={td}>
                {labels.field}:
            </Text>{' '}
            {filterRule.disabled ? (
                <Text c="foreground" span inherit td={td}>
                    {getUiString('filters.isAnyValue')}
                </Text>
            ) : (
                <>
                    <Text span inherit c="foreground" td={td}>
                        {labels.operator}
                    </Text>{' '}
                    <Text fw={600} span inherit c="foreground" td={td}>
                        {labels.value}
                    </Text>
                </>
            )}
            {isOverridden && (
                <Text span inherit c="foreground" fs="italic">
                    {' '}
                    {getUiString('tile.filters.overriddenByDashboard')}
                </Text>
            )}
        </Badge>
    );
};

/** The tile header's filter icon: the dashboard filters the tile ran with, then its own. */
export const TileFiltersPopover: FC<{
    dashboardFilters: TileFilterItem[];
    chartFilters: TileFilterItem[];
}> = ({ dashboardFilters, chartFilters }) => {
    const getUiString = useUiStrings();
    if (dashboardFilters.length === 0 && chartFilters.length === 0) return null;
    return (
        <TileHeaderPopover>
            <Popover.Dropdown
                maw="calc(100vw - 24px)"
                mah="calc(100dvh - 24px)"
                className={tileClasses.scrollableDropdown}
            >
                <Stack gap="xs" align="flex-start">
                    {dashboardFilters.length > 0 && (
                        <>
                            <Text c="dimmed" fw={500} fz="xs">
                                {getUiString(
                                    dashboardFilters.length > 1
                                        ? 'tile.filters.dashboardApplied.plural'
                                        : 'tile.filters.dashboardApplied.singular',
                                )}
                            </Text>
                            {dashboardFilters.map((item) => (
                                <TileFilterBadge
                                    key={item.key}
                                    item={item}
                                    kind="dashboard"
                                />
                            ))}
                        </>
                    )}
                    {chartFilters.length > 0 && (
                        <>
                            <Text c="dimmed" fw={500} fz="xs">
                                {getUiString(
                                    chartFilters.length > 1
                                        ? 'tile.filters.chart.plural'
                                        : 'tile.filters.chart.singular',
                                )}
                            </Text>
                            {chartFilters.map((item) => (
                                <TileFilterBadge
                                    key={item.key}
                                    item={item}
                                    kind="chart"
                                />
                            ))}
                        </>
                    )}
                </Stack>
            </Popover.Dropdown>
            <Popover.Target>
                <ActionIcon
                    aria-label={getUiString('tileMenu.filters')}
                    size="sm"
                >
                    <MantineIcon icon={IconFilter} />
                </ActionIcon>
            </Popover.Target>
        </TileHeaderPopover>
    );
};
