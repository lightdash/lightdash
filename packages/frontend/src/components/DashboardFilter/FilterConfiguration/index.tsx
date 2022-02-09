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

interface Props {
    label?: string;
    operator?: string;
    filteredValues?: string[] | undefined;
}

const FilterConfiguration: FC<Props> = ({
    label,
    operator,
    filteredValues,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const {
        addDimensionDashboardFilter,
        dimensionToFilter,
        setDimensionToFilter,
    } = useDashboardContext();
    const [filterType, setFilterType] = useState();

    const [valuesToFilter, setValuesToFilter] = useState<
        string[] | ReactNode[]
    >([filteredValues]);

    const addFilters = () => {
        const filterData = {
            id: projectUuid,
            target: {
                fieldId: dimensionToFilter.name,
            },
            operator: filterType,
            values: valuesToFilter,
        };
        // @ts-ignore
        addDimensionDashboardFilter(filterData);
    };

    const title = dimensionToFilter.label;

    return (
        <ConfigureFilterWrapper>
            <BackButton minimal onClick={() => setDimensionToFilter({})}>
                Back
            </BackButton>
            <Title>{title}</Title>
            <InputWrapper>
                <SelectField
                    id="filter-type"
                    value={operator || filterType}
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
                    values={valuesToFilter}
                    onChange={(values) => setValuesToFilter(values)}
                />
            </InputWrapper>
            <ApplyFilterButton
                type="submit"
                intent={Intent.PRIMARY}
                text="Apply"
                onClick={() => addFilters()}
            />
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
function getFieldId(field: any) {
    throw new Error('Function not implemented.');
}
