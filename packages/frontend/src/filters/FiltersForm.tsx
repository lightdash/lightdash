import {
    DimensionType,
    fieldId,
    fieldIdFromFilterGroup,
    filterableDimensionsOnly,
    FilterGroup,
    FilterGroupOperator,
    friendlyName,
    getDimensions,
} from 'common';
import React, { useState } from 'react';
import { Button, HTMLSelect } from '@blueprintjs/core';
import {
    defaultValuesForNewStringFilter,
    StringFilterGroupForm,
} from './StringFilterForm';
import {
    defaultValuesForNewBooleanFilter,
    defaultValuesForNewNumberFilter,
    NumberFilterGroupForm,
} from './NumberFilterForm';
import {
    defaultValuesForNewDateFilter,
    DateFilterGroupForm,
} from './DateFilterForm';
import { useExplorer } from '../providers/ExplorerProvider';
import { useExplore } from '../hooks/useExplore';
import { assertFilterId } from './FilterRow';
import BooleanFilterGroupForm from './BooleanFilter/BooleanFilterGroupForm';

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

const AddFilterGroup = () => {
    const {
        state: { filters: activeFilters },
        actions: { setFilters: setActiveFilters },
    } = useExplorer();
    const [showButton, setShowButton] = useState<boolean>(true);
    const explore = useExplore();
    if (explore.status !== 'success') return null;
    const dimensions = explore ? getDimensions(explore.data) : [];

    const onAdd = (filterGroup: FilterGroup) => {
        setActiveFilters([...activeFilters, filterGroup]);
    };

    const filterableDimensions = filterableDimensionsOnly(dimensions).filter(
        (dim) =>
            activeFilters.find(
                (f) => fieldIdFromFilterGroup(f) === fieldId(dim),
            ) === undefined,
    );

    const selectOptions = filterableDimensions.map((dim) => ({
        value: fieldId(dim),
        label: `${friendlyName(dim.table)} ${friendlyName(dim.name)}`,
    }));

    // When user selects a new dimension to filter on
    const onSelect = (id: string) => {
        setShowButton(true);
        const dimension = filterableDimensions.find(
            (dim) => fieldId(dim) === id,
        );
        if (dimension === undefined)
            throw new Error(
                `Selected dimension with id ${id} that does not exist as a filterable dimension in explore ${
                    explore.data.name || 'not loaded'
                }`,
            );

        // Add a default filter group as a placeholder for the new filter group
        const dimensionType = dimension.type;
        console.log('dimensionType', dimensionType);
        const createFilterGroup = ({
            operator,
            filters,
        }: {
            operator: FilterGroupOperator;
            filters: any[];
        }): FilterGroup => ({
            type: dimensionType,
            tableName: dimension.table,
            fieldName: dimension.name,
            operator,
            filters,
        });
        switch (dimensionType) {
            case DimensionType.STRING:
                onAdd(
                    createFilterGroup({
                        operator: FilterGroupOperator.and,
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.NUMBER:
                onAdd(
                    createFilterGroup({
                        operator: FilterGroupOperator.and,
                        filters: [defaultValuesForNewNumberFilter.equals],
                    }),
                );
                break;
            case DimensionType.DATE:
                onAdd(
                    createFilterGroup({
                        operator: FilterGroupOperator.and,
                        filters: [defaultValuesForNewDateFilter.equals],
                    }),
                );
                break;
            case DimensionType.TIMESTAMP:
                onAdd(
                    createFilterGroup({
                        operator: FilterGroupOperator.and,
                        filters: [defaultValuesForNewDateFilter.equals],
                    }),
                );
                break;
            case DimensionType.BOOLEAN:
                onAdd(
                    createFilterGroup({
                        operator: FilterGroupOperator.and,
                        filters: [defaultValuesForNewBooleanFilter.is],
                    }),
                );
                break;
            default:
                // eslint-disable-next-line no-case-declarations
                const nope: never = dimensionType;
                throw Error(
                    `No default filter group implemented for filter group with type ${dimensionType}`,
                );
        }
    };

    const onClick = () => {
        setShowButton(false);
    };

    if (showButton)
        return (
            <Button minimal onClick={onClick} icon="plus">
                Add dimension to filter
            </Button>
        );
    const placeholderOption = { value: '', label: 'Select a field...' };
    return (
        <HTMLSelect
            style={{ maxWidth: '400px' }}
            fill={false}
            minimal
            onChange={(e) => onSelect(e.currentTarget.value)}
            options={[placeholderOption, ...selectOptions]}
        />
    );
};

export const FiltersForm = () => {
    const {
        state: { filters: activeFilters },
        actions: { setFilters: setActiveFilters },
    } = useExplorer();

    const onDeleteFilterGroup = (index: number) => {
        setActiveFilters([
            ...activeFilters.slice(0, index),
            ...activeFilters.slice(index + 1),
        ]);
    };

    const onChangeFilterGroup = (index: number, filterGroup: FilterGroup) => {
        setActiveFilters([
            ...activeFilters.slice(0, index),
            filterGroup,
            ...activeFilters.slice(index + 1),
        ]);
    };

    return (
        <div
            style={{
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}
        >
            {activeFilters.map((filterGroup, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <React.Fragment key={idx}>
                    <div
                        style={{
                            paddingLeft: '15px',
                            width: '100%',
                            paddingBottom: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                        }}
                    >
                        <FilterGroupForm
                            filterGroup={filterGroup}
                            onDelete={() => onDeleteFilterGroup(idx)}
                            onChange={(changedFilterGroup) =>
                                onChangeFilterGroup(idx, changedFilterGroup)
                            }
                        />
                    </div>
                </React.Fragment>
            ))}
            <AddFilterGroup />
        </div>
    );
};

export default FiltersForm;
