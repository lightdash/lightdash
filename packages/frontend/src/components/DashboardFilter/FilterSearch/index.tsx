import { Button, InputGroup } from '@blueprintjs/core';
import Fuse from 'fuse.js';
import React, { FC, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChartConfig } from '../../../hooks/useChartConfig';
import { useSavedChartResults } from '../../../hooks/useQueryResults';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FilterConfiguration from '../FilterConfiguration';
import {
    DimensionItem,
    DimensionLabel,
    DimensionsContainer,
    FilterFooter,
    FilterModalContainer,
    SearchWrapper,
    Title,
} from './FilterSearch.styles';

interface Props {
    chartsData: any;
}

const FilterSearch: FC<Props> = ({ chartsData }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { dimensionToFilter, setDimensionToFilter } = useDashboardContext();

    const [search, setSearch] = useState<string>('');
    const dimensionsUuid: any[] = chartsData.reduce(
        (prevVal: any, currVal: any) => [
            ...prevVal,
            currVal.properties.savedChartUuid,
        ],

        [],
    );
    const { data } = useSavedQuery({
        id: dimensionsUuid[0] || undefined,
    });

    // @ts-ignore
    const queryResults = useSavedChartResults(projectUuid, data);
    const chartConfig = useChartConfig(
        data?.tableName,
        queryResults.data,
        data?.chartConfig.seriesLayout,
    );

    const filteredDimensions = useMemo(() => {
        const validSearch = search ? search.toLowerCase() : '';
        if (chartConfig.dimensionOptions) {
            if (validSearch !== '') {
                return new Fuse(Object.values(chartConfig.dimensionOptions), {
                    keys: ['name'],
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }
            return Object.values(chartConfig.dimensionOptions);
        }
        return [];
    }, [chartConfig.dimensionOptions, search]);

    return (
        <FilterModalContainer>
            {!dimensionToFilter ? (
                <>
                    <Title>Select a dimension to filter</Title>
                    <SearchWrapper>
                        <InputGroup
                            rightElement={
                                <Button
                                    minimal
                                    icon="cross"
                                    onClick={() => setSearch('')}
                                />
                            }
                            placeholder="Start typing to filter field names"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </SearchWrapper>
                    <DimensionsContainer>
                        {filteredDimensions.map((dimension) => (
                            <DimensionItem id={dimension.name}>
                                <DimensionLabel
                                    minimal
                                    text={dimension.label}
                                    onClick={() =>
                                        setDimensionToFilter(dimension.label)
                                    }
                                />
                            </DimensionItem>
                        ))}
                    </DimensionsContainer>
                    <FilterFooter>
                        Filters set on individual charts will be overridden.
                    </FilterFooter>
                </>
            ) : (
                <FilterConfiguration />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
