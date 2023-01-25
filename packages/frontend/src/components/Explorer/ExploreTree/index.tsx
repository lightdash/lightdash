import { Button, InputGroup, NonIdealState } from '@blueprintjs/core';
import {
    AdditionalMetric,
    CompiledTable,
    Dimension,
    Explore,
    getItemId,
    Metric,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { FormField } from '../ExploreSideBar/ExploreSideBar.styles';
import NewTableTree from './TableTree';
import { getSearchResults } from './TableTree/Tree/TreeProvider';

type ExploreTreeProps = {
    explore: Explore;
    additionalMetrics: AdditionalMetric[];
    onSelectedFieldChange: (fieldId: string, isDimension: boolean) => void;
    selectedNodes: Set<string>;
};

const ExploreTree: FC<ExploreTreeProps> = ({
    explore,
    additionalMetrics,
    selectedNodes,
    onSelectedFieldChange,
}) => {
    const [search, setSearch] = useState<string>('');

    const isSearching = !!search && search !== '';
    const searchHasResults = (table: CompiledTable) => {
        const allValues = Object.values({
            ...table.dimensions,
            ...table.metrics,
        });
        const allFields = [...allValues, ...additionalMetrics].reduce<
            Record<string, AdditionalMetric | Dimension | Metric>
        >((acc, item) => ({ ...acc, [getItemId(item)]: item }), {});

        return getSearchResults(allFields, search).size > 0;
    };

    const tableTrees = Object.values(explore.tables)
        .sort((tableA) => (tableA.name === explore.baseTable ? -1 : 1))
        .filter((table) => !(isSearching && !searchHasResults(table)))
        .map((table) => (
            <NewTableTree
                key={table.name}
                searchQuery={search}
                showTableLabel={Object.keys(explore.tables).length > 1}
                table={table}
                additionalMetrics={additionalMetrics?.filter(
                    (metric) => metric.table === table.name,
                )}
                selectedItems={selectedNodes}
                onSelectedNodeChange={onSelectedFieldChange}
            />
        ));

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <FormField>
                <InputGroup
                    leftIcon="search"
                    rightElement={
                        <Button
                            minimal
                            icon="cross"
                            onClick={() => setSearch('')}
                        />
                    }
                    placeholder="Search metrics + dimensions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </FormField>

            <div style={{ overflowY: 'auto' }}>
                {tableTrees.length > 0 ? (
                    tableTrees
                ) : (
                    <NonIdealState>No fields found</NonIdealState>
                )}
            </div>
        </div>
    );
};

export default ExploreTree;
