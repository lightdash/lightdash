import {
    fieldId,
    filterableDimensionsOnly,
    FilterGroup,
    FilterGroupOperator,
    friendlyName,
    getDimensions,
} from "common";
import React, {useState} from "react";
import {Button, HTMLSelect} from "@blueprintjs/core";
import {defaultValuesForNewStringFilter, StringFilterGroupForm} from "./StringFilterForm";
import {defaultValuesForNewNumberFilter, NumberFilterGroupForm} from "./NumberFilterForm";
import {useExploreConfig} from "../hooks/useExploreConfig";
import {useExplores} from "../hooks/useExplores";

export const FiltersForm = () => {
    const {
        activeFilters,
        setActiveFilters
    } = useExploreConfig()

    const onDeleteFilterGroup = (index: number) => {
        setActiveFilters([...activeFilters.slice(0, index), ...activeFilters.slice(index + 1)])
    }

    const onChangeFilterGroup = (index: number, filterGroup: FilterGroup) => {
        setActiveFilters([...activeFilters.slice(0, index), filterGroup, ...activeFilters.slice(index + 1)])
    }

    return (
            <div style={{
                paddingTop: '10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'start',
            }}>
                {activeFilters.map( (filterGroup, idx) => (
                    <React.Fragment key={idx}>
                        <div style={{paddingLeft: '15px', width: '100%', paddingBottom: '20px'}}>
                            <FilterGroupForm filterGroup={filterGroup} key={idx} onDelete={() => onDeleteFilterGroup(idx)} onChange={filterGroup => onChangeFilterGroup(idx, filterGroup)}/>
                        </div>
                    </React.Fragment>
                ))}
                <AddFilterGroup />
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

const AddFilterGroup = () => {
    const {
        activeTableName,
        activeFilters,
        setActiveFilters,
    } = useExploreConfig()
    const [showButton, setShowButton] = useState<boolean>(true)
    const exploreResults = useExplores()
    const explore = (exploreResults.data || []).find(e => e.name === activeTableName)
    const dimensions = explore ? getDimensions(explore) : []

    const onAdd = (filterGroup: FilterGroup) => {
        setActiveFilters([...activeFilters, filterGroup])
    }

    const filterableDimensions = filterableDimensionsOnly(dimensions)
        .filter(dim => activeFilters.find(f => fieldId(f.dimension) === fieldId(dim)) === undefined)

    const selectOptions = filterableDimensions.map(dim => ({
        value: fieldId(dim),
        label: `${friendlyName(dim.table)} ${friendlyName(dim.name)}`
    }))

    // When user selects a new dimension to filter on
    const onSelect = (id: string) => {
        setShowButton(true)
        const dimension = filterableDimensions.find(dim => fieldId(dim) === id)
        if (dimension === undefined)
            throw new Error(`Selected dimension with id ${id} that does not exist as a filterable dimension in explore ${explore?.name || 'not loaded'}`)

        // Add a default filter group as a placeholder for the new filter group
        const dimensionType = dimension.type
        switch (dimension.type) {
            case "string":
                onAdd({
                    type: 'string',
                    dimension: dimension,
                    operator: FilterGroupOperator.and,
                    filters: [defaultValuesForNewStringFilter['equals']] // Default empty equals filter
                })
                break
            case "number":
                onAdd({
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