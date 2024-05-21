import {
    getItemId,
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
    type Dimension,
    type Explore,
    type Metric,
} from '@lightdash/common';
import { ActionIcon, Center, ScrollArea, Text, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import TableTree from './TableTree';
import { getSearchResults } from './TableTree/Tree/TreeProvider';

type ExploreTreeProps = {
    explore: Explore;
    additionalMetrics: AdditionalMetric[];
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
    selectedNodes: Set<string>;
    customDimensions?: CustomDimension[];
    selectedDimensions?: string[];
    missingFields?: {
        all: string[];
        customDimensions: CustomDimension[] | undefined;
        customMetrics: AdditionalMetric[] | undefined;
    };
};

type Records = Record<string, AdditionalMetric | Dimension | Metric>;

const ExploreTree: FC<ExploreTreeProps> = ({
    explore,
    additionalMetrics,
    selectedNodes,
    onSelectedFieldChange,
    customDimensions,
    selectedDimensions,
    missingFields,
}) => {
    const [search, setSearch] = useState<string>('');
    const isSearching = !!search && search !== '';

    const searchHasResults = useCallback(
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

            return getSearchResults(allFields, search).size > 0;
        },
        [additionalMetrics, search],
    );

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
                    !(isSearching && !searchHasResults(table)) && !table.hidden,
            );
    }, [explore, searchHasResults, isSearching]);

    return (
        <>
            <TextInput
                icon={<MantineIcon icon={IconSearch} />}
                rightSection={
                    search ? (
                        <ActionIcon onClick={() => setSearch('')}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder="Search metrics + dimensions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            <ScrollArea
                variant="primary"
                className="only-vertical"
                offsetScrollbars
                scrollbarSize={8}
            >
                {tableTrees.length > 0 ? (
                    tableTrees.map((table, index) => (
                        <TableTree
                            key={table.name}
                            isOpenByDefault={index === 0}
                            searchQuery={search}
                            showTableLabel={
                                Object.keys(explore.tables).length > 1
                            }
                            table={table}
                            additionalMetrics={additionalMetrics}
                            selectedItems={selectedNodes}
                            onSelectedNodeChange={onSelectedFieldChange}
                            customDimensions={customDimensions}
                            missingCustomMetrics={
                                table.name === explore.baseTable &&
                                missingFields?.customMetrics
                                    ? missingFields.customMetrics
                                    : []
                            }
                            missingCustomDimensions={
                                table.name === explore.baseTable &&
                                missingFields?.customDimensions
                                    ? missingFields.customDimensions
                                    : []
                            }
                            missingFields={missingFields?.all}
                            selectedDimensions={selectedDimensions}
                        />
                    ))
                ) : (
                    <Center>
                        <Text color="dimmed">No fields found...</Text>
                    </Center>
                )}
            </ScrollArea>
        </>
    );
};

export default ExploreTree;
