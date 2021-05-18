import {friendlyName} from "common";
import {Button, HTMLSelect} from "@blueprintjs/core";
import React, {ReactNode} from "react";

type FilterRowProps = {
    isFirst: boolean,
    isLast: boolean,
    tableName: string,
    fieldName: string,
    onAdd: () => void,
    onDelete: () => void,
    children: ReactNode
}
export const FilterRow = ({isFirst, isLast, tableName, fieldName, onAdd, children, onDelete}: FilterRowProps) => {
    const header = (
        <span>
            {friendlyName(tableName)} <b>{friendlyName(fieldName)}</b>
        </span>
    )
    return (
        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center'}}>
            <div style={{flex: '0 0 300px'}}>
                {isFirst && header}
            </div>
            <div style={{maxWidth: '400px', flex: '1 0 auto', display: 'flex', flexDirection: 'row', justifyContent: 'flex-start'}}>
                {children}
            </div>
            <div style={{flex: '0 0 70px', display: 'flex', justifyContent: 'flex-start'}}>
                <Button minimal={true} icon={'cross'} onClick={onDelete}/>
                {isLast && <Button minimal={true} icon={'plus'} onClick={onAdd}/>}
            </div>
        </div>
    )
}

type SelectFilterOperatorProps<T extends string> = {
    value: T,
    options: {value: T, label: string}[],
    onChange: (operator: T) => void,
}
export const SelectFilterOperator = <T extends string,>({ value, options, onChange }: SelectFilterOperatorProps<T>) => {
    return (
        <HTMLSelect fill={false} value={value} style={{width: '150px'}} minimal={true} options={options} onChange={event => onChange(event.currentTarget.value as T)}/>
    )
}