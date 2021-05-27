import { useQueryClient, useQuery } from 'react-query'
import {getExplores} from "../api";
import {ApiError, Explore} from "common";

export const useExplores = () => {
    const queryClient = useQueryClient()
    const queryKey = 'explores'
    const query = useQuery<Explore[], ApiError>({
        queryKey,
        queryFn: () => getExplores(true),
        staleTime: 120000,
    })
    // const refresh = () => queryClient.invalidateQueries(queryKey)
    const refresh = () => {}
    return {...query, refresh }
}