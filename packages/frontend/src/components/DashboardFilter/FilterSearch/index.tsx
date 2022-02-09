import { Field } from 'common';
import React, { FC, useState } from 'react';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterFooter,
    FilterModalContainer,
    Title,
} from './FilterSearch.styles';

type Props = {
    fields: Field[];
};

const FilterSearch: FC<Props> = ({ fields }) => {
    const [selectedField, setSelectedField] = useState<Field>();

    return (
        <FilterModalContainer>
            {!selectedField ? (
                <>
                    <Title>Select a dimension to filter</Title>

                    <FieldAutoComplete
                        fields={fields}
                        onChange={(field) => setSelectedField(field)}
                    />
                    <FilterFooter>
                        Filters set on individual charts will be overridden.
                    </FilterFooter>
                </>
            ) : (
                <FilterConfiguration
                    field={selectedField}
                    clearField={() => setSelectedField(undefined)}
                />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
