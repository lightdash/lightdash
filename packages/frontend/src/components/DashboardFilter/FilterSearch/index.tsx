import { Field } from 'common';
import React, { FC, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterFooter,
    FilterModalContainer,
    Title,
} from './FilterSearch.styles';

type Props = {
    fields: Field[];
    onClose: () => void;
};

const FilterSearch: FC<Props> = ({ fields, onClose }) => {
    const [selectedField, setSelectedField] = useState<Field>();
    const { addDimensionDashboardFilter } = useDashboardContext();

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
                    onSave={(value) => {
                        setSelectedField(undefined);
                        addDimensionDashboardFilter(value);
                        onClose();
                    }}
                    onBack={() => setSelectedField(undefined)}
                />
            )}
        </FilterModalContainer>
    );
};

export default FilterSearch;
