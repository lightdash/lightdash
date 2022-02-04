import { Button, InputGroup, Intent, TagInput } from '@blueprintjs/core';
import { FilterOperator } from 'common';
import Fuse from 'fuse.js';
import React, { FC, ReactNode, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChartConfig } from '../../../hooks/useChartConfig';
import { useSavedChartResults } from '../../../hooks/useQueryResults';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
    DimensionItem,
    DimensionLabel,
    DimensionsContainer,
    FilterFooter,
    FilterModalContainer,
    InputWrapper,
    SearchWrapper,
    SelectField,
    Title,
} from './FilterSearch.styles';

interface Props {
    chartsData: any;
}

const FilterSearch: FC<Props> = ({ chartsData }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [search, setSearch] = useState<string>('');
    const [dimensionToFilter, setDimensionToFilter] = useState('');
    const [filterType, setFilterType] = useState('');
    const [valuesToFilter, setValuesToFilter] = useState<
        string[] | ReactNode[]
    >(['']);
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
                <ConfigureFilterWrapper>
                    <BackButton
                        minimal
                        onClick={() => setDimensionToFilter('')}
                    >
                        Back
                    </BackButton>
                    <Title>{dimensionToFilter}</Title>
                    <InputWrapper>
                        <SelectField
                            id="filter-type"
                            value={filterType}
                            onChange={(e) =>
                                setFilterType(
                                    e.currentTarget.value as FilterOperator,
                                )
                            }
                            options={Object.values(FilterOperator).map(
                                (filterOperator) => ({
                                    value: filterOperator,
                                    label: filterOperator
                                        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                                        .toLowerCase(),
                                }),
                            )}
                        />
                    </InputWrapper>
                    <InputWrapper>
                        <TagInput
                            addOnBlur
                            tagProps={{ minimal: true }}
                            values={valuesToFilter || []}
                            onChange={(values) => setValuesToFilter(values)}
                        />
                    </InputWrapper>
                    <ApplyFilterButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Apply"
                    />
                </ConfigureFilterWrapper>
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
