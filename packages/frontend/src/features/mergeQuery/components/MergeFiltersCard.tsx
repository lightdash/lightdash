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
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMerge } from '../context/useMerge';
import { syncMergeJoinFilters } from '../utils/syncMergeJoinFilters';

const FilterSectionTitle: FC<{
    label: string;
    primary: boolean;
    count: number;
}> = ({ label, primary, count }) => (
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
    const additionalSource = merge.additionalSources[0];
    const dispatch = useExplorerDispatch();

    const tableName = useExplorerSelector(selectTableName);
    const primaryFilters = useExplorerSelector(selectFilters);
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const parameterValues = useExplorerSelector(selectParameters);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const { data: primaryExplore } = useExplore(tableName);
    const { data: additionalExplore } = useExplore(
        additionalSource?.exploreName ?? undefined,
    );
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen) setHasEverOpened(true);
    }, [filterIsOpen]);

    const primaryFields = useFieldsWithSuggestions({
        exploreData: primaryExplore,
        rows: undefined,
        customDimensions,
        additionalMetrics,
        tableCalculations,
        includeHiddenFields: false,
    });
    const additionalFields = useFieldsWithSuggestions({
        exploreData: additionalExplore,
        rows: undefined,
        customDimensions: additionalSource?.customDimensions,
        additionalMetrics: additionalSource?.additionalMetrics,
        tableCalculations: undefined,
        includeHiddenFields: false,
    });

    const primaryCount = useMemo(
        () => countTotalFilterRules(primaryFilters),
        [primaryFilters],
    );
    const additionalCount = useMemo(
        () => countTotalFilterRules(additionalSource?.filters ?? {}),
        [additionalSource?.filters],
    );
    const total = useMemo(
        () =>
            new Set(
                [
                    ...getTotalFilterRules(primaryFilters),
                    ...getTotalFilterRules(additionalSource?.filters ?? {}),
                ].map((rule) => rule.id),
            ).size,
        [primaryFilters, additionalSource?.filters],
    );

    const setBoth = useCallback(
        (
            changedSourceId: string,
            nextPrimary: Filters,
            nextAdditional: Filters,
        ) => {
            if (!additionalSource) return;
            const synced = syncMergeJoinFilters({
                changedSourceId,
                filtersBySourceId: {
                    [PRIMARY_SOURCE_ID]: nextPrimary,
                    [additionalSource.id]: nextAdditional,
                },
                joinParts: merge.joinParts,
            });
            dispatch(
                explorerActions.setFilters(
                    synced[PRIMARY_SOURCE_ID] ?? nextPrimary,
                ),
            );
            merge.setSourceFilters(
                additionalSource.id,
                synced[additionalSource.id] ?? nextAdditional,
            );
        },
        [additionalSource, dispatch, merge],
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
                            label={primaryExplore?.label ?? 'First table'}
                            primary
                            count={primaryCount}
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={primaryFields}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={primaryExplore?.baseTable}
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
                                filters={primaryFilters}
                                setFilters={(next) =>
                                    setBoth(
                                        PRIMARY_SOURCE_ID,
                                        next,
                                        additionalSource?.filters ?? {},
                                    )
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Divider />

                    <Stack gap="xs">
                        <FilterSectionTitle
                            label={additionalExplore?.label ?? 'Second table'}
                            primary={false}
                            count={additionalCount}
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={additionalFields}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={additionalExplore?.baseTable}
                            parameterValues={parameterValues}
                        >
                            <FiltersForm
                                isEditMode={isEditMode}
                                filters={additionalSource?.filters ?? {}}
                                setFilters={(next) =>
                                    additionalSource &&
                                    setBoth(
                                        additionalSource.id,
                                        primaryFilters,
                                        next,
                                    )
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Text size="xs" c="dimmed" px="xs" pb="xs">
                        Filters on a matching field apply to both queries. Other
                        filters stay with their query.
                    </Text>
                </Stack>
            )}
        </CollapsableCard>
    );
};
