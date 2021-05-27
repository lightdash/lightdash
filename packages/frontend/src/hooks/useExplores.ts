import { useQueryClient, useQuery } from 'react-query'
import {getExplores} from "../api";
import {ApiError, Explore} from "common";

export const useExplores = () => {
    const queryClient = useQueryClient()
    const queryKey = 'explores'
    const query = useQuery<Explore[], ApiError>({
        queryKey,
        queryFn: () => getExplores(true),
        staleTime: 5 * 60 * 1000,   // 5 mins
    })
    const refresh = () => queryClient.invalidateQueries(queryKey)
    return {...query, refresh }
}