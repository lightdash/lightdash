import React, { useState } from 'react';
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
import { Button, HTMLSelect } from '@blueprintjs/core';
import { useExplorer } from '../../providers/ExplorerProvider';
import { useExplore } from '../../hooks/useExplore';
import { defaultValuesForNewStringFilter } from '../string-filter/StringFilterForm';
import { defaultValuesForNewNumberFilter } from '../number-filter/NumberFilterForm';
import { defaultValuesForNewDateFilter } from '../date-filter/DateFilterForm';
import { defaultValuesForNewBooleanFilter } from '../boolean-filter/BooleanFilterForm';

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
        const createFilterGroup = ({
            filters,
        }: {
            filters: any[];
        }): FilterGroup => ({
            type: dimensionType,
            tableName: dimension.table,
            fieldName: dimension.name,
            operator: FilterGroupOperator.and,
            filters,
        });
        switch (dimensionType) {
            case DimensionType.STRING:
                onAdd(
                    createFilterGroup({
                        filters: [defaultValuesForNewStringFilter.equals],
                    }),
                );
                break;
            case DimensionType.NUMBER:
                onAdd(
                    createFilterGroup({
                        filters: [defaultValuesForNewNumberFilter.equals],
                    }),
                );
                break;
            case DimensionType.DATE:
                onAdd(
                    createFilterGroup({
                        filters: [defaultValuesForNewDateFilter.equals],
                    }),
                );
                break;
            case DimensionType.TIMESTAMP:
                onAdd(
                    createFilterGroup({
                        filters: [defaultValuesForNewDateFilter.equals],
                    }),
                );
                break;
            case DimensionType.BOOLEAN:
                onAdd(
                    createFilterGroup({
                        filters: [defaultValuesForNewBooleanFilter.equals],
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

export default AddFilterGroup;
