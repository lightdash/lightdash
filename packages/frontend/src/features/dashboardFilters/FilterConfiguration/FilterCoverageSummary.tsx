import type {
    DashboardFilterableField,
    DashboardFilterRule,
    DashboardTab,
    DashboardTile,
} from '@lightdash/common';
import { Anchor, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { doesFilterApplyToAnyTile, getTabsForFilterRule } from './utils';

interface FilterCoverageSummaryProps {
    draftFilterRule: DashboardFilterRule;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    availableTileFilters: Record<string, DashboardFilterableField[]>;
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
    const getUiString = useUiStrings();
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
                    {getUiString('filters.coverage.noMatchingCharts')}{' '}
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        onClick={onNavigateToTilesTab}
                    >
                        {getUiString('filters.coverage.reviewTileTargets')}
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
                {getUiString('filters.coverage.wontAffectCurrentTab')} <br />{' '}
                {getUiString('filters.coverage.appliesAutomaticallyTo')}{' '}
                <strong>{applicableTabNames.join(', ')}</strong>. <br />
                <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    onClick={onNavigateToTilesTab}
                >
                    {getUiString('filters.coverage.reviewAndChangeTarget')}
                </Anchor>
            </Text>
        </Callout>
    );
};

export default FilterCoverageSummary;
