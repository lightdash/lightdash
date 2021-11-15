import { FilterGroup } from 'common';
import React from 'react';
import BooleanFilterGroupForm from '../boolean-filter/BooleanFilterGroupForm';
import { assertFilterId } from '../common/FilterRow';
import DateFilterGroupForm from '../date-filter/DateFilterGroupForm';
import NumberFilterGroupForm from '../number-filter/NumberFilterGroupForm';
import StringFilterGroupForm from '../string-filter/StringFilterGroupForm';

type FilterGroupFormProps = {
    filterGroup: FilterGroup;
    onDelete: () => void;
    onChange: (filterGroup: FilterGroup) => void;
};

const FilterGroupForm = ({
    filterGroup,
    onDelete,
    onChange,
}: FilterGroupFormProps) => {
    // Delete the whole filter group if it has no filters
    if (filterGroup.filters.length === 0) onDelete();

    // assert all filters have an id
    if (filterGroup.filters.some((filter) => filter.id === undefined)) {
        const newGroup = filterGroup;
        const newFilters = filterGroup.filters.map(assertFilterId);
        newGroup.filters = newFilters as typeof newGroup.filters; // typescript can't map union type
        onChange(newGroup);
    }

    // Render form for each filter type
    const groupType = filterGroup.type;
    switch (filterGroup.type) {
        case 'string':
            return (
                <StringFilterGroupForm
                    filterGroup={filterGroup}
                    onChange={onChange}
                />
            );
        case 'number':
            return (
                <NumberFilterGroupForm
                    filterGroup={filterGroup}
                    onChange={onChange}
                />
            );
        case 'date':
        case 'timestamp':
            return (
                <DateFilterGroupForm
                    filterGroup={filterGroup}
                    onChange={onChange}
                />
            );
        case 'boolean':
            return (
                <BooleanFilterGroupForm
                    filterGroup={filterGroup}
                    onChange={onChange}
                />
            );
        default:
            // eslint-disable-next-line no-case-declarations
            const nope: never = filterGroup;
            throw Error(`Filter group form not implemented for ${groupType}`);
    }
};

export default FilterGroupForm;
