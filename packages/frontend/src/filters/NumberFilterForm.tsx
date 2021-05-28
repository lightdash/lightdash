import {ControlGroup, NumericInput, TagInput} from "@blueprintjs/core";
import React from "react";
import {NumberFilter, NumberFilterGroup} from "common";
import {FilterRow, SelectFilterOperator} from "./FilterRow";

export const defaultValuesForNewNumberFilter: {[key in NumberFilter["operator"]]: NumberFilter} = {
    equals: {operator: "equals", values: []},
    notEquals: {operator: "notEquals", values: []},
    isNull: {operator: "isNull"},
    notNull: {operator: "notNull"},
    greaterThan: {operator: "greaterThan", value: 0},
    lessThan: {operator: "lessThan", value: 0},
}

const options: {value: NumberFilter["operator"], label: string}[] = [
    {value: "notEquals", label: 'is not equal to'},
    {value: "equals", label: 'is equal to'},
    {value: "notNull", label: 'is not null'},
    {value: "isNull", label: 'is null'},
    {value: "lessThan", label: 'is less than'},
    {value: "greaterThan", label: 'is greater than'},
]

type NumberFilterGroupFormProps = {
    filterGroup: NumberFilterGroup,
    onChange: (filterGroup: NumberFilterGroup) => void,
}
export const NumberFilterGroupForm = ({filterGroup, onChange}: NumberFilterGroupFormProps) => {
    const defaultNewFilter: NumberFilter = {operator: 'equals', values: []}
    return (
        <>
            {
                filterGroup.filters.map((filter, index) => (
                    <FilterRow
                        key={index}
                        isFirst={index === 0}
                        isLast={index === (filterGroup.filters.length - 1)}
                        tableName={filterGroup.tableName}
                        fieldName={filterGroup.fieldName}
                        onAdd={() => onChange({...filterGroup, filters: [...filterGroup.filters, defaultNewFilter]})}
                        onDelete={() => onChange({
                            ...filterGroup,
                            filters: [...filterGroup.filters.slice(0, index), ...filterGroup.filters.slice(index + 1)]
                        })}
                    >
                        <ControlGroup style={{width: '100%'}}>
                            <SelectFilterOperator
                                value={filter.operator}
                                options={options}
                                onChange={operator => onChange({
                                    ...filterGroup,
                                    filters: [...filterGroup.filters.slice(0, index), defaultValuesForNewNumberFilter[operator], ...filterGroup.filters.slice(index + 1)]
                                })}
                            />
                            <NumberFilterForm
                                filter={filter}
                                onChange={fg => onChange({
                                    ...filterGroup,
                                    filters: [...filterGroup.filters.slice(0, index), fg, ...filterGroup.filters.slice(index + 1)]
                                })}
                            />
                        </ControlGroup>
                    </FilterRow>
                ))

            }
        </>
    )
}
type NumberFilterFormProps = {
    filter: NumberFilter,
    onChange: (filter: NumberFilter) => void

}
const NumberFilterForm = ({filter, onChange}: NumberFilterFormProps) => {
    const filterType = filter.operator
    switch (filter.operator) {
        case "isNull":
            return <div></div>
        case "notNull":
            return <div></div>
        case "equals":
            return <TagInput
                fill={true}
                tagProps={{minimal: true}}
                values={filter.values}
                onAdd={values => onChange({...filter, values: [...filter.values, ...values.map(parseFloat).filter(v => v !== undefined)]})}
                onRemove={(value, index) => onChange({
                    ...filter,
                    values: [...filter.values.slice(0, index), ...filter.values.slice(index + 1)]
                })}
            />
        case "notEquals":
            return <TagInput
                fill={true}
                tagProps={{minimal: true}}
                values={filter.values}
                onAdd={values => onChange({...filter, values: [...filter.values, ...values.map(parseFloat).filter(v => v !== undefined)]})}
                onRemove={(value, index) => onChange({
                    ...filter,
                    values: [...filter.values.slice(0, index), ...filter.values.slice(index + 1)]
                })}
            />
        case "greaterThan":
            return <NumericInput
                fill={true}
                value={filter.value}
                onValueChange={value => onChange({...filter, value})}
            />
        case "lessThan":
            return <NumericInput
                fill={true}
                value={filter.value}
                onValueChange={value => onChange({...filter, value})}
            />
        default:
            const nope: never = filter
            throw Error(`No form implemented for String filter operator ${filterType}`)
    }
}