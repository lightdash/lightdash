import {useQuery} from "react-query";
import {ApiError, ApiTablesResults, PartialTable} from "common";
import {lightdashApi} from "../api";

const getTables = async () => {
    return await lightdashApi<ApiTablesResults>({
        url: '/tables',
        method: 'GET',
        body: undefined
    })
}

export const useTables = () => {
    const queryKey = 'tables'
    const query = useQuery<PartialTable[], ApiError>({
        queryKey,
        queryFn: getTables,
    })
    return query
}