import {
    Explore,
    fieldId,
    filterableDimensionsOnly,
    FilterGroup,
    FilterGroupOperator,
    friendlyName,
    getDimensions,
} from "common";
import React, {useState} from "react";
import {Button, Card, Divider, HTMLSelect} from "@blueprintjs/core";
import {defaultValuesForNewStringFilter, StringFilterGroupForm} from "./StringFilterForm";
import {defaultValuesForNewNumberFilter, NumberFilterGroupForm} from "./NumberFilterForm";

type FiltersFormProps = {
    explore: Explore,
    filters: FilterGroup[],
    onChangeFilters: (filters: FilterGroup[]) => void,
}
export const FiltersForm = ( { explore, filters, onChangeFilters }: FiltersFormProps) => {
    const onAddFilterGroup = (filterGroup: FilterGroup) => {
        onChangeFilters([...filters, filterGroup])
    }

    const onDeleteFilterGroup = (index: number) => {
        onChangeFilters([...filters.slice(0, index), ...filters.slice(index + 1)])
    }

    const onChangeFilterGroup = (index: number, filterGroup: FilterGroup) => {
        onChangeFilters([...filters.slice(0, index), filterGroup, ...filters.slice(index + 1)])
    }

    return (
            <div style={{
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}>
                {filters.map( (filterGroup, idx) => (
                    <React.Fragment key={idx}>
                        <div style={{paddingLeft: '15px', width: '100%', paddingBottom: '20px'}}>
                            <FilterGroupForm filterGroup={filterGroup} key={idx} onDelete={() => onDeleteFilterGroup(idx)} onChange={filterGroup => onChangeFilterGroup(idx, filterGroup)}/>
                        </div>
                    </React.Fragment>
                ))}
                <AddFilter explore={explore} onAddFilter={onAddFilterGroup} filters={filters}/>
            </div>
    )
}

type FilterGroupFormProps = {
    filterGroup: FilterGroup,
    onDelete: () => void,
    onChange: (filterGroup: FilterGroup) => void,
}
const FilterGroupForm = ({ filterGroup, onDelete, onChange }: FilterGroupFormProps) => {
    // Delete the whole filter group if it has no filters
    if (filterGroup.filters.length === 0)
        onDelete()

    // Render form for each filter type
    const groupType = filterGroup.type
    switch(filterGroup.type) {
        case "string":
            return <StringFilterGroupForm filterGroup={filterGroup} onChange={onChange} />
        case "number":
            return <NumberFilterGroupForm filterGroup={filterGroup} onChange={onChange} />
        default:
            const nope: never = filterGroup
            throw Error(`Filter group form not implemented for ${groupType}`)
    }
}

type AddFilterProps = {
    explore: Explore,
    filters: FilterGroup[],
    onAddFilter: (filterGroup: FilterGroup) => void
}

const AddFilter = ( { explore, filters, onAddFilter }: AddFilterProps) => {
    const [showButton, setShowButton] = useState<boolean>(true)
    const filterableDimensions = filterableDimensionsOnly(getDimensions(explore))
        .filter(dim => filters.find(f => fieldId(f.dimension) === fieldId(dim)) === undefined)
    const selectOptions = filterableDimensions.map(dim => ({
        value: fieldId(dim),
        label: `${friendlyName(dim.table)} ${friendlyName(dim.name)}`
    }))

    // When user selects a new dimension to filter on
    const onSelect = (id: string) => {
        setShowButton(true)
        const dimension = filterableDimensions.find(dim => fieldId(dim) === id)
        if (dimension === undefined)
            throw new Error(`Selected dimension with id ${id} that does not exist as a filterable dimension in explore ${explore.name}`)

        // Add a default filter group as a placeholder for the new filter group
        const dimensionType = dimension.type
        switch (dimension.type) {
            case "string":
                onAddFilter({
                    type: 'string',
                    dimension: dimension,
                    operator: FilterGroupOperator.and,
                    filters: [defaultValuesForNewStringFilter['equals']] // Default empty equals filter
                })
                break
            case "number":
                onAddFilter({
                    type: 'number',
                    dimension: dimension,
                    operator: FilterGroupOperator.and,
                    filters: [defaultValuesForNewNumberFilter['equals']]  // Default empty equals filter
                })
                break
            default:
                const _nope: never = dimension
                throw Error(`No default filter group implemented for filter group with type ${dimensionType}`)
        }
    }

    const onClick = () => {
        setShowButton(false)
    }

    if (showButton)
        return (
            <Button minimal={true} onClick={onClick} icon={'plus'}>Add dimension to filter</Button>
        )
    const placeholderOption = {value: '', label: 'Select a field...'}
    return (
        <HTMLSelect
            style={{maxWidth: '400px'}}
            fill={false}
            minimal={true}
            onChange={e => onSelect(e.currentTarget.value)}
            options={[placeholderOption, ...selectOptions]}
            />
    )
}

export default FiltersForm