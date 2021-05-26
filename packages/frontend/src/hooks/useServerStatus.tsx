import {lightdashApi} from "../api";
import {ApiError, ApiStatusResults} from "common";
import {useQuery} from "react-query";

const getStatus = async () => (
    await lightdashApi<ApiStatusResults>({
        method: 'GET',
        url: '/status',
        body: undefined,
    })
)

export const useServerStatus = () => {
    const queryKey = 'status'
    const query = useQuery<ApiStatusResults, ApiError>({
        queryKey,
        queryFn: getStatus,
    })
    // Invalidate cache
    if (query.data && query.data === 'loading')
        setTimeout(query.refetch, 1000)
    return query
}