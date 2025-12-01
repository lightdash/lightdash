import {
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
    selectMissingCustomDimensions,
    selectMissingCustomMetrics,
    selectMissingFieldIds,
    useExplorerSelector,
} from '../../../features/explorer/store';
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

const ExploreTreeComponent: FC<ExploreTreeProps> = ({
    explore,
    onSelectedFieldChange,
}) => {
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);

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

    // Pre-compute node maps for all sections to avoid expensive recomputation during rendering
    const sectionNodeMaps = useMemo(() => {
        return getNodeMapsForVirtualization(
            explore,
            additionalMetrics,
            customDimensions,
        );
    }, [explore, additionalMetrics, customDimensions]);

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
                Object.values(explore.tables).reduce<Record<string, string[]>>(
                    (acc, table) => {
                        return { ...acc, [table.name]: searchResults(table) };
                    },
                    {},
                ),
            );
        });
    }, [explore, isSearching, searchResults]);

    const tableTrees = useMemo(() => {
        return Object.values(explore.tables)
            .sort((tableA, tableB) => {
                if (tableA.name === explore.baseTable) return -1;
                if (tableB.name === explore.baseTable) return 1;
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
    }, [explore, isSearching, searchResultsMap]);

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
            showMultipleTables: Object.keys(explore.tables).length > 1,
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
        explore.tables,
        isSearching,
        missingCustomDimensions,
        missingCustomMetrics,
        missingFieldIds,
        searchResultsMap,
        sectionNodeMaps,
        selectedDimensions,
        tableTrees,
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
