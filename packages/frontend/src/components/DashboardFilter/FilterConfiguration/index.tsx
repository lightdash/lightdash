import { Intent, TagInput } from '@blueprintjs/core';
import { Field, fieldId, FilterOperator } from 'common';
import React, { FC, ReactNode, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
    field: Field;
    operator?: string;
    filteredValues?: string[] | undefined;
    clearField: () => void;
}

const FilterConfiguration: FC<Props> = ({
    field,
    operator,
    filteredValues,
    clearField,
}) => {
    const { addDimensionDashboardFilter } = useDashboardContext();
    const [filterType, setFilterType] = useState();

    const [valuesToFilter, setValuesToFilter] = useState<
        string[] | ReactNode[]
    >([filteredValues]);

    const addFilter = () => {
        addDimensionDashboardFilter({
            id: uuidv4(),
            target: {
                fieldId: fieldId(field),
                tableName: field.table,
            },
            operator: FilterOperator.EQUALS,
            values: [],
        });
        clearField();
    };

    const title = field.label;

    return (
        <ConfigureFilterWrapper>
            <BackButton minimal onClick={clearField}>
                Back
            </BackButton>
            <Title>{title}</Title>
            <InputWrapper>
                <SelectField
                    id="filter-type"
                    value={operator || filterType}
                    onChange={(e) =>
                        console.log('operator', e.currentTarget.value)
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
                onClick={addFilter}
            />
        </ConfigureFilterWrapper>
    );
};

export default FilterConfiguration;
