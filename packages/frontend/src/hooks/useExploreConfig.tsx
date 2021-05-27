import React from 'react';
import {useHistory, useLocation, useParams} from "react-router-dom";

type ContextProps = {
    activeTableName: string | undefined,
    setActiveTableName: (tableName: string) => void,
    activeFields: Set<string>,
    toggleActiveField: (fieldName: string) => void,
}
const context = React.createContext<ContextProps>({
    activeTableName: undefined,
    setActiveTableName: () => {},
    activeFields: new Set<string>(),
    toggleActiveField: () => {},
});

export const ExploreConfigContext: React.FC = ({ children }) => {
    const searchParams = new URLSearchParams(useLocation().search)
    const pathParams = useParams<{tableId: string | undefined}>()
    const history = useHistory()

    // Currently active table
    const activeTableName = pathParams.tableId
    const setActiveTableName = (tableName: string) => {
        history.push(`/tables/${tableName}`)
    }

    // Currently active fields
    const fieldSearchParam = searchParams.get('fields')
    const activeFields = new Set<string>(fieldSearchParam === null ? [] : fieldSearchParam.split(','))
    const setActiveFields = (fields: Set<string>) => {
        const newParams = new URLSearchParams(searchParams)
        if (fields.size === 0)
            newParams.delete('fields')
        else
            newParams.set('fields', Array.from(fields).join(','))
        history.push({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    const toggleActiveField = (field: string) => {
        const newFields = new Set(activeFields)
        if (!newFields.delete(field))
            newFields.add(field)
        setActiveFields(newFields)
    }

    const contextValue = {
        activeTableName,
        setActiveTableName,
        activeFields,
        toggleActiveField,
    }

    return (
        <context.Provider value={contextValue}>{children}</context.Provider>
    )
}

export const useExploreConfig = () => {
    const { activeTableName, setActiveTableName, activeFields, toggleActiveField } = React.useContext(context)

    return {
        activeTableName,
        setActiveTableName,
        activeFields,
        toggleActiveField,
    }
}