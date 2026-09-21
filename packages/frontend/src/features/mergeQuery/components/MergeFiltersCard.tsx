import {
    countTotalFilterRules,
    getTotalFilterRules,
    isTimeZone,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';
import { Badge, Box, Divider, Group, Stack, Text } from '@mantine/core';
import { Fragment, useCallback, useEffect, useState, type FC } from 'react';
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
    selectIsEditMode,
    selectIsFiltersExpanded,
    selectMetricQuery,
    selectParameters,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMerge } from '../context/useMerge';
import { getMergeSourceMetricQuery } from '../utils/getMergeSourceMetricQuery';
import { syncMergeJoinFilters } from '../utils/syncMergeJoinFilters';

const SourceFilters: FC<{
    query: MetricQuery;
    primary: boolean;
    setFilters: (filters: Filters) => void;
}> = ({ query, primary, setFilters }) => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const parameterValues = useExplorerSelector(selectParameters);
    const { data: explore } = useExplore(query.exploreName);
    const fields = useFieldsWithSuggestions({
        exploreData: explore,
        rows: undefined,
        customDimensions: query.customDimensions,
        additionalMetrics: query.additionalMetrics,
        tableCalculations: query.tableCalculations,
        includeHiddenFields: false,
    });
    const count = countTotalFilterRules(query.filters);
    return (
        <Stack gap="xs">
            <Group justify="space-between" gap="xs" px="xs" pt={4} pb={2}>
                <Group gap={7}>
                    <Box
                        w={7}
                        h={7}
                        style={{
                            borderRadius: 2,
                            background: primary
                                ? 'var(--mantine-color-blue-6)'
                                : 'var(--mantine-color-orange-6)',
                        }}
                    />
                    <Text size="xs" fw={600}>
                        {explore?.label ?? query.exploreName}
                    </Text>
                </Group>
                <Text size="xs" c="dimmed">
                    {count === 0 ? 'No filters' : `${count} active`}
                </Text>
            </Group>
            <FiltersProvider
                projectUuid={projectUuid}
                itemsMap={fields}
                startOfWeek={
                    project.data?.warehouseConnection?.startOfWeek ?? undefined
                }
                popoverProps={{ withinPortal: true }}
                baseTable={explore?.baseTable}
                parameterValues={parameterValues}
                metricQueryTimezone={
                    query.timezone && isTimeZone(query.timezone)
                        ? query.timezone
                        : undefined
                }
            >
                <FiltersForm
                    isEditMode={isEditMode}
                    filters={query.filters}
                    setFilters={setFilters}
                />
            </FiltersProvider>
        </Stack>
    );
};

/** Join-key rules are shared across every source; other filters stay local. */
export const MergeFiltersCard: FC = () => {
    const merge = useMerge();
    const dispatch = useExplorerDispatch();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen) setHasEverOpened(true);
    }, [filterIsOpen]);
    const sources = [
        { id: PRIMARY_SOURCE_ID, query: metricQuery },
        ...merge.additionalSources
            .filter((source) => source.exploreName)
            .map((source) => ({
                id: source.id,
                query: getMergeSourceMetricQuery(source, metricQuery.limit),
            })),
    ];
    const total = new Set(
        sources.flatMap((source) =>
            getTotalFilterRules(source.query.filters).map((rule) => rule.id),
        ),
    ).size;
    const setFilters = useCallback(
        (changedSourceId: string, filters: Filters) => {
            const synced = syncMergeJoinFilters({
                changedSourceId,
                filtersBySourceId: {
                    [PRIMARY_SOURCE_ID]: metricQuery.filters,
                    ...Object.fromEntries(
                        merge.additionalSources.map((source) => [
                            source.id,
                            source.filters,
                        ]),
                    ),
                    [changedSourceId]: filters,
                },
                joinParts: merge.joinParts,
            });
            dispatch(explorerActions.setFilters(synced[PRIMARY_SOURCE_ID]));
            merge.additionalSources.forEach((source) =>
                merge.setSourceFilters(source.id, synced[source.id]),
            );
        },
        [dispatch, merge, metricQuery.filters],
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
                    <Badge>
                        {total} active filter{total === 1 ? '' : 's'}
                    </Badge>
                ) : null
            }
        >
            {hasEverOpened && (
                <Stack gap="md">
                    {sources.map((source, index) => (
                        <Fragment key={source.id}>
                            {index > 0 && <Divider />}
                            <SourceFilters
                                query={source.query}
                                primary={source.id === PRIMARY_SOURCE_ID}
                                setFilters={(filters) =>
                                    setFilters(source.id, filters)
                                }
                            />
                        </Fragment>
                    ))}
                    <Text size="xs" c="dimmed" px="xs" pb="xs">
                        Filters on a matching field apply to all queries. Other
                        filters stay with their query.
                    </Text>
                </Stack>
            )}
        </CollapsableCard>
    );
};
