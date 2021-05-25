import {useHistory, useLocation} from 'react-router-dom'

const useActiveFields = () => {
    const params = new URLSearchParams(useLocation().search)
    const history = useHistory()
    const activeFields = new Set<string>((params.get('fields') || '').split(','))

    const setActiveFields = (fields: Set<string>) => {
        history.push({
            pathname: history.location.pathname,
            search: new URLSearchParams({...params, fields: Array.from(fields).join(',') }).toString()
        })
    }

    const toggleActiveField = (field: string) => {
        const newFields = new Set(activeFields)
        if (!newFields.delete(field))
            newFields.add(field)
        setActiveFields(newFields)
    }

    return { activeFields, setActiveFields, toggleActiveField }
}

export default useActiveFields