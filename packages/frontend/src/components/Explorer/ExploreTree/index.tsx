import {
    ExploreType,
    getItemId,
    type AdditionalMetric,
    type CompiledTable,
    type Dimension,
    type Explore,
    type Metric,
} from '@lightdash/common';
import { ActionIcon, Loader, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
    type FC,
} from 'react';
import {
    selectActiveFields,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectDimensions,
    selectMetricQuery,
    selectMissingCustomDimensions,
    selectMissingCustomMetrics,
    selectMissingFieldIds,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useSemanticLayerDimensions from '../../../features/metricFlow/hooks/useSemanticLayerDimensions';
import useSemanticLayerMetrics from '../../../features/metricFlow/hooks/useSemanticLayerMetrics';
import { convertMetricQueryToMetricFlowQuery } from '../../../features/metricFlow/utils/convertMetricQueryToMetricFlowQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineIcon from '../../common/MantineIcon';
import { getSearchResults } from './TableTree/Tree/utils';
import {
    flattenTreeForVirtualization,
    getNodeMapsForVirtualization,
} from './TableTree/Virtualization/flattenTree';
import VirtualizedTreeList from './TableTree/Virtualization/VirtualizedTreeList';

type ExploreTreeProps = {
    explore: Explore;
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
};

type Records = Record<string, AdditionalMetric | Dimension | Metric>;

const SEMANTIC_LAYER_REFRESH_DEBOUNCE_MS = 250;

const ExploreTreeComponent: FC<ExploreTreeProps> = ({
    explore,
    onSelectedFieldChange,
}) => {
    const projectUuid = useProjectUuid();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const metricQuery = useExplorerSelector(selectMetricQuery);

    const missingCustomMetrics = useExplorerSelector((state) =>
        selectMissingCustomMetrics(state, explore),
    );
    const missingCustomDimensions = useExplorerSelector((state) =>
        selectMissingCustomDimensions(state, explore),
    );
    const missingFieldIds = useExplorerSelector((state) =>
        selectMissingFieldIds(state, explore),
    );
    const activeFields = useExplorerSelector(selectActiveFields);
    const selectedDimensions = useExplorerSelector(selectDimensions);
    const isSemanticLayerExplore = explore.type === ExploreType.SEMANTIC_LAYER;

    const metricFlowQuery = useMemo(() => {
        if (!isSemanticLayerExplore) return undefined;
        return convertMetricQueryToMetricFlowQuery(metricQuery, explore);
    }, [explore, isSemanticLayerExplore, metricQuery]);

    const selectedMetricNames = metricFlowQuery?.metrics ?? {};
    const selectedDimensionNames = metricFlowQuery?.dimensions ?? {};
    const [debouncedSelectedMetricNames] = useDebouncedValue(
        selectedMetricNames,
        SEMANTIC_LAYER_REFRESH_DEBOUNCE_MS,
    );
    const [debouncedSelectedDimensionNames] = useDebouncedValue(
        selectedDimensionNames,
        SEMANTIC_LAYER_REFRESH_DEBOUNCE_MS,
    );
    const hasSelectedMetrics =
        Object.keys(debouncedSelectedMetricNames).length > 0;
    const hasSelectedDimensions =
        Object.keys(debouncedSelectedDimensionNames).length > 0;

    const { data: semanticLayerDimensions } = useSemanticLayerDimensions(
        projectUuid,
        debouncedSelectedMetricNames,
        {
            enabled:
                isSemanticLayerExplore && hasSelectedMetrics && !!projectUuid,
            keepPreviousData: true,
        },
    );
    const { data: semanticLayerMetrics } = useSemanticLayerMetrics(
        projectUuid,
        debouncedSelectedDimensionNames,
        {
            enabled:
                isSemanticLayerExplore &&
                hasSelectedDimensions &&
                !!projectUuid,
        },
    );

    const availableDimensionNames = useMemo(() => {
        if (!isSemanticLayerExplore || !hasSelectedMetrics) return undefined;
        if (!semanticLayerDimensions) return undefined;
        const names = semanticLayerDimensions.dimensions.map((dimension) =>
            dimension.name.toLowerCase(),
        );
        return new Set(names);
    }, [hasSelectedMetrics, isSemanticLayerExplore, semanticLayerDimensions]);

    const availableMetricNames = useMemo(() => {
        if (!isSemanticLayerExplore || !hasSelectedDimensions) return undefined;
        if (!semanticLayerMetrics) return undefined;
        const names = semanticLayerMetrics.metricsForDimensions.map((metric) =>
            metric.name.toLowerCase(),
        );
        return new Set(names);
    }, [hasSelectedDimensions, isSemanticLayerExplore, semanticLayerMetrics]);

    const [search, setSearch] = useState<string>('');
    const [isPending, startTransition] = useTransition();
    const [searchResultsMap, setSearchResultsMap] = useState<
        Record<string, string[]>
    >({});
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const isSearching = useMemo(() => {
        const trimmedSearch = debouncedSearch.trim();
        return !!trimmedSearch && trimmedSearch !== '';
    }, [debouncedSearch]);

    const treeExplore = useMemo(() => {
        if (!isSemanticLayerExplore) return explore;

        const filteredTables = Object.fromEntries(
            Object.entries(explore.tables).map(([tableName, table]) => {
                const dimensions = Object.fromEntries(
                    Object.entries(table.dimensions).filter(
                        ([fieldId, dimension]) => {
                            if (!availableDimensionNames) return true;
                            const baseName =
                                dimension.timeIntervalBaseDimensionName?.toLowerCase();
                            return (
                                activeFields.has(fieldId) ||
                                (baseName &&
                                    availableDimensionNames.has(baseName)) ||
                                availableDimensionNames.has(
                                    dimension.name.toLowerCase(),
                                )
                            );
                        },
                    ),
                );
                const metrics = Object.fromEntries(
                    Object.entries(table.metrics).filter(
                        ([fieldId, metric]) =>
                            !availableMetricNames ||
                            activeFields.has(fieldId) ||
                            availableMetricNames.has(metric.name.toLowerCase()),
                    ),
                );
                return [
                    tableName,
                    {
                        ...table,
                        dimensions,
                        metrics,
                    },
                ];
            }),
        );

        const mergedDimensions = Object.values(filteredTables).reduce(
            (acc, table) => ({
                ...acc,
                ...table.dimensions,
            }),
            {},
        );
        const mergedMetrics = Object.values(filteredTables).reduce(
            (acc, table) => ({
                ...acc,
                ...table.metrics,
            }),
            {},
        );

        const baseTable = explore.tables[explore.baseTable];
        const mergedTable = {
            ...baseTable,
            name: explore.baseTable,
            label: explore.label || baseTable.label,
            dimensions: mergedDimensions,
            metrics: mergedMetrics,
        };

        return {
            ...explore,
            tables: {
                [mergedTable.name]: mergedTable,
            },
        };
    }, [
        availableDimensionNames,
        availableMetricNames,
        activeFields,
        explore,
        isSemanticLayerExplore,
    ]);

    // Pre-compute node maps for all sections to avoid expensive recomputation during rendering
    const sectionNodeMaps = useMemo(() => {
        return getNodeMapsForVirtualization(
            treeExplore,
            additionalMetrics,
            customDimensions,
        );
    }, [treeExplore, additionalMetrics, customDimensions]);

    const handleSearchChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setSearch(e.target.value);
        },
        [],
    );

    const handleClearSearch = useCallback(() => {
        setSearch('');
    }, []);

    const searchResults = useCallback(
        (table: CompiledTable) => {
            const allValues = Object.values({
                ...table.dimensions,
                ...table.metrics,
            });
            const allFields = [
                ...allValues,
                ...additionalMetrics,
            ].reduce<Records>((acc, item) => {
                return { ...acc, [getItemId(item)]: item };
            }, {});

            return getSearchResults(allFields, debouncedSearch);
        },
        [additionalMetrics, debouncedSearch],
    );

    useEffect(() => {
        startTransition(() => {
            if (!isSearching) return;
            setSearchResultsMap(
                Object.values(treeExplore.tables).reduce<
                    Record<string, string[]>
                >((acc, table) => {
                    return { ...acc, [table.name]: searchResults(table) };
                }, {}),
            );
        });
    }, [treeExplore, isSearching, searchResults]);

    const tableTrees = useMemo(() => {
        return Object.values(treeExplore.tables)
            .sort((tableA, tableB) => {
                if (tableA.name === treeExplore.baseTable) return -1;
                if (tableB.name === treeExplore.baseTable) return 1;
                // Sorting explores by label
                return tableA.label.localeCompare(tableB.label);
            })
            .filter(
                (table) =>
                    !(
                        isSearching &&
                        searchResultsMap[table.name]?.length === 0
                    ) && !table.hidden,
            );
    }, [treeExplore, isSearching, searchResultsMap]);

    // Manage table expansion state
    const [expandedTables, setExpandedTables] = useState<Set<string>>(() => {
        // Initialize with first table expanded
        const firstTable = tableTrees[0];
        return firstTable ? new Set([firstTable.name]) : new Set();
    });

    // Manage group expansion state
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        new Set(),
    );

    const toggleTable = useCallback((tableName: string) => {
        setExpandedTables((prev) => {
            const next = new Set(prev);
            if (next.has(tableName)) {
                next.delete(tableName);
            } else {
                next.add(tableName);
            }
            return next;
        });
    }, []);

    const toggleGroup = useCallback((groupKey: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    }, []);

    const virtualizedTreeData = useMemo(() => {
        return flattenTreeForVirtualization({
            tables: tableTrees,
            showMultipleTables:
                Object.keys(treeExplore.tables).length > 1 &&
                !isSemanticLayerExplore,
            expandedTables,
            expandedGroups,
            searchQuery: debouncedSearch,
            searchResultsMap,
            isSearching,
            additionalMetrics,
            customDimensions: customDimensions ?? [],
            missingCustomMetrics,
            missingCustomDimensions,
            missingFieldIds,
            selectedDimensions,
            activeFields,
            sectionNodeMaps,
        });
    }, [
        activeFields,
        additionalMetrics,
        customDimensions,
        debouncedSearch,
        expandedGroups,
        expandedTables,
        isSemanticLayerExplore,
        isSearching,
        missingCustomDimensions,
        missingCustomMetrics,
        missingFieldIds,
        searchResultsMap,
        sectionNodeMaps,
        selectedDimensions,
        tableTrees,
        treeExplore.tables,
    ]);

    return (
        <>
            <TextInput
                icon={<MantineIcon icon={IconSearch} />}
                rightSection={
                    isPending ? (
                        <Loader
                            size="xs"
                            data-testid="ExploreTree/SearchInput-Loader"
                        />
                    ) : search ? (
                        <ActionIcon onClick={handleClearSearch}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder="Search metrics + dimensions"
                value={search}
                onChange={handleSearchChange}
                data-testid="ExploreTree/SearchInput"
            />

            <VirtualizedTreeList
                data={virtualizedTreeData}
                onToggleTable={toggleTable}
                onToggleGroup={toggleGroup}
                onSelectedFieldChange={onSelectedFieldChange}
            />
        </>
    );
};

const ExploreTree = memo(ExploreTreeComponent);

ExploreTree.displayName = 'ExploreTree';

export default ExploreTree;
