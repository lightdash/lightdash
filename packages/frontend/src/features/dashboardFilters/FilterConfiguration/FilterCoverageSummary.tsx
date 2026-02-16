import type {
    DashboardFilterRule,
    DashboardTab,
    DashboardTile,
    FilterableDimension,
} from '@lightdash/common';
import { Anchor, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import { doesFilterApplyToAnyTile, getTabsForFilterRule } from './utils';

interface FilterCoverageSummaryProps {
    draftFilterRule: DashboardFilterRule;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    availableTileFilters: Record<string, FilterableDimension[]>;
    onNavigateToTilesTab: () => void;
}

const FilterCoverageSummary: FC<FilterCoverageSummaryProps> = ({
    draftFilterRule,
    tiles,
    tabs,
    activeTabUuid,
    availableTileFilters,
    onNavigateToTilesTab,
}) => {
    const sortedTabUuids = useMemo(
        () => [...tabs].sort((a, b) => a.order - b.order).map((t) => t.uuid),
        [tabs],
    );

    const applicableTabs = useMemo(
        () =>
            getTabsForFilterRule(
                draftFilterRule,
                tiles,
                sortedTabUuids,
                availableTileFilters,
            ),
        [draftFilterRule, tiles, sortedTabUuids, availableTileFilters],
    );

    const appliesToAny = useMemo(
        () =>
            doesFilterApplyToAnyTile(
                draftFilterRule,
                tiles,
                availableTileFilters,
            ),
        [draftFilterRule, tiles, availableTileFilters],
    );

    if (tabs.length <= 1) return null;

    const appliesToCurrentTab =
        !activeTabUuid || applicableTabs.includes(activeTabUuid);

    if (appliesToCurrentTab) return null;

    const tabNamesByUuid = new Map(tabs.map((t) => [t.uuid, t.name]));

    if (!appliesToAny) {
        return (
            <Callout variant="warning">
                <Text size="xs">
                    No charts have a matching field for this filter.{' '}
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        onClick={onNavigateToTilesTab}
                    >
                        Review tile targets
                    </Anchor>
                </Text>
            </Callout>
        );
    }

    const applicableTabNames = applicableTabs
        .map((uuid) => tabNamesByUuid.get(uuid))
        .filter(Boolean);

    return (
        <Callout variant="warning">
            <Text size="xs">
                This filter won't affect charts on the current tab. <br /> It
                applies automatically to:{' '}
                <strong>{applicableTabNames.join(', ')}</strong>. <br />
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    onClick={onNavigateToTilesTab}
                >
                    Review tile targets and change the filter target
                </Anchor>
            </Text>
        </Callout>
    );
};

export default FilterCoverageSummary;
