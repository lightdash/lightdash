import {useQuery} from "react-query";
import {ApiError, ApiTablesResults, PartialTable} from "common";
import {lightdashApi} from "../api";
import {useEffect} from "react";
import {useExploreConfig} from "./useExploreConfig";

const getTables = async () => {
    return await lightdashApi<ApiTablesResults>({
        url: '/tables',
        method: 'GET',
        body: undefined
    })
}

export const useTables = () => {
    const { setError } = useExploreConfig()
    const queryKey = 'tables'
    const query = useQuery<PartialTable[], ApiError>({
        queryKey,
        queryFn: getTables,
        retry: false,
    })

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n')
            setError({title: first, text: rest.join('\n')})
        }
    }, [query.error, setError])

    return query
}