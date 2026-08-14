import {
    countTotalFilterRules,
    getTotalFilterRules,
    isTimeZone,
    type Filters,
} from '@lightdash/common';
import { Badge, Box, Divider, Group, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import FiltersForm from '../../../components/common/Filters';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../../../components/Explorer/FiltersCard/useFieldsWithSuggestions';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectFilters,
    selectIsEditMode,
    selectIsFiltersExpanded,
    selectMetricQuery,
    selectParameters,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { useMerge } from '../context/useMerge';
import { syncMergeJoinFilters } from '../utils/syncMergeJoinFilters';

const FilterSectionTitle: FC<{
    label: string;
    side: 'a' | 'b';
    count: number;
}> = ({ label, side, count }) => (
    <Group justify="space-between" gap="xs">
        <Group gap={7}>
            <Box
                w={7}
                h={7}
                style={{
                    borderRadius: 2,
                    background:
                        side === 'a'
                            ? 'var(--mantine-color-blue-6)'
                            : 'var(--mantine-color-orange-6)',
                }}
            />
            <Text size="xs" fw={600}>
                {label}
            </Text>
        </Group>
        <Text size="xs" c="dimmed">
            {count === 0 ? 'No filters' : `${count} active`}
        </Text>
    </Group>
);

/** Both source filters in one card. Join-key rules are shared automatically. */
export const MergeFiltersCard: FC = () => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const merge = useMerge();
    const dispatch = useExplorerDispatch();

    const tableName = useExplorerSelector(selectTableName);
    const filtersA = useExplorerSelector(selectFilters);
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const parameterValues = useExplorerSelector(selectParameters);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const { data: exploreA } = useExplore(tableName);
    const { data: exploreB } = useExplore(
        merge.queryB.exploreName ?? undefined,
    );
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen) setHasEverOpened(true);
    }, [filterIsOpen]);

    const fieldsA = useFieldsWithSuggestions({
        exploreData: exploreA,
        rows: undefined,
        customDimensions,
        additionalMetrics,
        tableCalculations,
        includeHiddenFields: false,
    });
    const fieldsB = useFieldsWithSuggestions({
        exploreData: exploreB,
        rows: undefined,
        customDimensions: merge.queryB.customDimensions,
        additionalMetrics: merge.queryB.additionalMetrics,
        tableCalculations: undefined,
        includeHiddenFields: false,
    });

    const countA = useMemo(() => countTotalFilterRules(filtersA), [filtersA]);
    const countB = useMemo(
        () => countTotalFilterRules(merge.filtersB),
        [merge.filtersB],
    );
    const total = useMemo(
        () =>
            new Set(
                [
                    ...getTotalFilterRules(filtersA),
                    ...getTotalFilterRules(merge.filtersB),
                ].map((rule) => rule.id),
            ).size,
        [filtersA, merge.filtersB],
    );

    const setBoth = useCallback(
        (changedSide: 'a' | 'b', nextA: Filters, nextB: Filters) => {
            const synced = syncMergeJoinFilters({
                changedSide,
                filtersA: nextA,
                filtersB: nextB,
                joinParts: merge.joinParts,
            });
            dispatch(explorerActions.setFilters(synced.filtersA));
            merge.setFiltersB(synced.filtersB);
        },
        [dispatch, merge],
    );

    return (
        <CollapsableCard
            isOpen={filterIsOpen}
            title="Filters"
            disabled={total === 0 && !isEditMode}
            onToggle={() =>
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                )
            }
            headerElement={
                total > 0 && !filterIsOpen ? (
                    <Badge color="gray" variant="light" tt="none" fw={500}>
                        {total} active filter{total === 1 ? '' : 's'}
                    </Badge>
                ) : null
            }
        >
            {hasEverOpened && (
                <Stack gap="md">
                    <Stack gap="xs">
                        <FilterSectionTitle
                            label={exploreA?.label ?? 'Query A'}
                            side="a"
                            count={countA}
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={fieldsA}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={exploreA?.baseTable}
                            parameterValues={parameterValues}
                            metricQueryTimezone={
                                metricQuery.timezone &&
                                isTimeZone(metricQuery.timezone)
                                    ? metricQuery.timezone
                                    : undefined
                            }
                        >
                            <FiltersForm
                                isEditMode={isEditMode}
                                filters={filtersA}
                                setFilters={(next) =>
                                    setBoth('a', next, merge.filtersB)
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Divider />

                    <Stack gap="xs">
                        <FilterSectionTitle
                            label={exploreB?.label ?? 'Query B'}
                            side="b"
                            count={countB}
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={fieldsB}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={exploreB?.baseTable}
                            parameterValues={parameterValues}
                        >
                            <FiltersForm
                                isEditMode={isEditMode}
                                filters={merge.filtersB}
                                setFilters={(next) =>
                                    setBoth('b', filtersA, next)
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Text size="xs" c="dimmed">
                        Filters on a matching field apply to both queries. Other
                        filters stay with their query.
                    </Text>
                </Stack>
            )}
        </CollapsableCard>
    );
};
