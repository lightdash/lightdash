import {
    FeatureFlags,
    getItemId,
    type AdditionalMetric,
    type CompiledTable,
    type Dimension,
    type Explore,
    type Metric,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Loader,
    ScrollArea,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
    type FC,
} from 'react';
import {
    selectActiveFields,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectMissingCustomDimensions,
    selectMissingCustomMetrics,
    selectMissingFieldIds,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../../common/MantineIcon';
import TableTree from './TableTree';
import { getSearchResults } from './TableTree/Tree/utils';
import { flattenTreeForVirtualization } from './TableTree/Virtualization/flattenTree';
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

    const [search, setSearch] = useState<string>('');
    const [isPending, startTransition] = useTransition();
    const [searchResultsMap, setSearchResultsMap] = useState<
        Record<string, string[]>
    >({});
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const isSearching = useMemo(() => {
        const trimmedSearch = search.trim();
        return !!trimmedSearch && trimmedSearch !== '';
    }, [search]);
    const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
    const savedScrollTopRef = useRef<number>(0);
    const previousActiveFieldsRef = useRef(activeFields);

    const { data: experimentalExplorerImprovements } = useFeatureFlag(
        FeatureFlags.ExperimentalExplorerImprovements,
    );

    const { data: experimentalVirtualizedSideBar } = useFeatureFlag(
        FeatureFlags.ExperimentalVirtualizedSideBar,
    );

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
            setSearchResultsMap(
                Object.values(explore.tables).reduce<Record<string, string[]>>(
                    (acc, table) => {
                        return { ...acc, [table.name]: searchResults(table) };
                    },
                    {},
                ),
            );
        });
    }, [explore, searchResults]);

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

    /**
     * Preserve scroll position when fields are selected/deselected
     *
     * When a field is selected, it gets pinned to the top of the sidebar list.
     * Without preservation, this DOM reordering causes the scroll to jump back to the top.
     */

    // Capture scroll position before activeFields changes
    if (
        experimentalExplorerImprovements?.enabled &&
        previousActiveFieldsRef.current !== activeFields &&
        scrollAreaViewportRef.current
    ) {
        savedScrollTopRef.current = scrollAreaViewportRef.current.scrollTop;
        previousActiveFieldsRef.current = activeFields;
    }

    // Restore scroll position after DOM updates
    useEffect(() => {
        if (!experimentalExplorerImprovements?.enabled) {
            return;
        }

        const viewport = scrollAreaViewportRef.current;
        if (viewport) {
            viewport.scrollTop = savedScrollTopRef.current;
        }
    }, [activeFields, experimentalExplorerImprovements]);

    const tableTreeComponents = useMemo(
        () =>
            tableTrees.length > 0 ? (
                tableTrees.map((table) => (
                    <TableTree
                        key={table.name}
                        isExpanded={expandedTables.has(table.name)}
                        onToggle={() => toggleTable(table.name)}
                        searchQuery={debouncedSearch}
                        showTableLabel={Object.keys(explore.tables).length > 1}
                        table={table}
                        additionalMetrics={additionalMetrics}
                        onSelectedNodeChange={onSelectedFieldChange}
                        customDimensions={customDimensions}
                        missingCustomMetrics={missingCustomMetrics}
                        missingCustomDimensions={missingCustomDimensions}
                        missingFieldIds={missingFieldIds}
                        searchResults={searchResultsMap[table.name]}
                        isSearching={isSearching}
                        expandedGroups={expandedGroups}
                        onToggleGroup={toggleGroup}
                    />
                ))
            ) : (
                <Center display={isSearching ? 'none' : 'flex'}>
                    <Text color="dimmed">No fields found...</Text>
                </Center>
            ),
        [
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
            onSelectedFieldChange,
            searchResultsMap,
            tableTrees,
            toggleGroup,
            toggleTable,
        ],
    );
    // Prepare virtualized tree data when experimental improvements are enabled
    const virtualizedTreeData = useMemo(() => {
        if (!experimentalVirtualizedSideBar?.enabled) {
            return null;
        }

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
            activeFields,
        });
    }, [
        activeFields,
        additionalMetrics,
        customDimensions,
        debouncedSearch,
        expandedGroups,
        expandedTables,
        experimentalVirtualizedSideBar?.enabled,
        explore.tables,
        isSearching,
        missingCustomDimensions,
        missingCustomMetrics,
        missingFieldIds,
        searchResultsMap,
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

            {experimentalVirtualizedSideBar?.enabled && virtualizedTreeData ? (
                <VirtualizedTreeList
                    data={virtualizedTreeData}
                    onToggleTable={toggleTable}
                    onToggleGroup={toggleGroup}
                    onSelectedFieldChange={onSelectedFieldChange}
                />
            ) : (
                <ScrollArea
                    variant="primary"
                    className="only-vertical"
                    offsetScrollbars
                    scrollbarSize={8}
                    viewportRef={scrollAreaViewportRef}
                >
                    {tableTreeComponents}
                </ScrollArea>
            )}
        </>
    );
};

const ExploreTree = memo(ExploreTreeComponent);

ExploreTree.displayName = 'ExploreTree';

export default ExploreTree;
