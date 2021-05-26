import {lightdashApi} from "../api";
import {ApiError, ApiTableResults, Explore} from "common";
import {useQuery} from "react-query";
import {useExploreConfig} from "./useExploreConfig";

const getTable = async (tableId: string) => {
    return await lightdashApi<ApiTableResults>({
        url: `/tables/${tableId}`,
        method: 'GET',
        body: undefined,
    })
}

export const useTable = () => {
    const { activeTableName } = useExploreConfig()
    const queryKey = ['tables', activeTableName]
    const query = useQuery<Explore, ApiError>({
        queryKey,
        queryFn: () => getTable(activeTableName || ''),
        enabled: activeTableName !== undefined,
    })
    return query
}