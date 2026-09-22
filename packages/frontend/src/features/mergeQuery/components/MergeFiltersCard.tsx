import {
    countTotalFilterRules,
    getTotalFilterRules,
    isTimeZone,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';
import { Badge, Divider, Group, Stack, Text } from '@mantine/core';
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
import { useMergeSourceNames } from '../hooks/useMergeSourceNames';
import { getMergeSourceMetricQuery } from '../utils/getMergeSourceMetricQuery';
import { syncMergeJoinFilters } from '../utils/syncMergeJoinFilters';

const SourceFilters: FC<{
    query: MetricQuery;
    sourceName: string;
    setFilters: (filters: Filters) => void;
}> = ({ query, sourceName, setFilters }) => {
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
    const exploreLabel = explore?.label ?? query.exploreName;
    const displayLabel =
        sourceName === query.exploreName
            ? exploreLabel
            : `${exploreLabel} · ${sourceName}`;
    return (
        <Stack gap={0} py="xs">
            <Group justify="space-between" gap="xs" px="sm" mih={24}>
                <Text size="xs" fw={600}>
                    {displayLabel}
                </Text>
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
                    compact
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
    const sourceNames = useMergeSourceNames();
    const dispatch = useExplorerDispatch();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen) setHasEverOpened(true);
    }, [filterIsOpen]);
    const sources = [
        {
            id: PRIMARY_SOURCE_ID,
            query: metricQuery,
            sourceName: sourceNames.nameByHandle[PRIMARY_SOURCE_ID],
        },
        ...merge.additionalSources
            .filter((source) => source.exploreName)
            .map((source) => ({
                id: source.id,
                query: getMergeSourceMetricQuery(source, metricQuery.limit),
                sourceName: sourceNames.nameByHandle[source.id],
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
                <Stack gap={0}>
                    {sources.map((source, index) => (
                        <Fragment key={source.id}>
                            {index > 0 && <Divider />}
                            <SourceFilters
                                query={source.query}
                                sourceName={source.sourceName}
                                setFilters={(filters) =>
                                    setFilters(source.id, filters)
                                }
                            />
                        </Fragment>
                    ))}
                    <Divider />
                    <Text size="xs" c="dimmed" px="sm" py="xs">
                        Filters on a matching field apply to all queries. Other
                        filters stay with their query.
                    </Text>
                </Stack>
            )}
        </CollapsableCard>
    );
};
