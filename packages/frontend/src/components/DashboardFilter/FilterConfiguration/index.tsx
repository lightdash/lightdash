import { Intent, TagInput } from '@blueprintjs/core';
import { FilterOperator } from 'common';
import React, { FC, ReactNode, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    ApplyFilterButton,
    BackButton,
    ConfigureFilterWrapper,
    InputWrapper,
    SelectField,
    Title,
} from './FilterConfiguration.styled';

const FilterConfiguration: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { dashboardFilters } = useDashboardContext();

    const [dimensionToFilter, setDimensionToFilter] = useState('');
    const [filterType, setFilterType] = useState('');
    const [valuesToFilter, setValuesToFilter] = useState<
        string[] | ReactNode[]
    >(['']);

    return (
        <ConfigureFilterWrapper>
            <BackButton minimal onClick={() => setDimensionToFilter('')}>
                Back
            </BackButton>
            <Title>{dimensionToFilter}</Title>
            <InputWrapper>
                <SelectField
                    id="filter-type"
                    value={filterType}
                    onChange={(e) =>
                        setFilterType(e.currentTarget.value as FilterOperator)
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
    );
};

export default FilterConfiguration;
