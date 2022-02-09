import { Intent, TagInput } from '@blueprintjs/core';
import { DashboardFilterRule, Field, fieldId, FilterOperator } from 'common';
import React, { FC, ReactNode, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
    filterRule?: DashboardFilterRule;
    onSave: (value: DashboardFilterRule) => void;
    onBack: () => void;
}

const FilterConfiguration: FC<Props> = ({
    field,
    filterRule,
    onSave,
    onBack,
}) => {
    const [filterType, setFilterType] = useState(filterRule?.operator);
    const [valuesToFilter, setValuesToFilter] = useState<
        string[] | ReactNode[]
    >(filterRule?.values || []);

    const addFilter = () => {
        onSave({
            id: uuidv4(),
            ...filterRule,
            target: {
                fieldId: fieldId(field),
                tableName: field.table,
            },
            operator: FilterOperator.EQUALS,
            values: [],
        });
    };

    const title = field.label;

    return (
        <ConfigureFilterWrapper>
            <BackButton minimal onClick={onBack}>
                Back
            </BackButton>
            <Title>{title}</Title>
            <InputWrapper>
                <SelectField
                    id="filter-type"
                    value={filterType}
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
