import {lightdashApi} from "../api";
import {ApiError, ApiRefreshResults} from "common";
import { useMutation, useQueryClient } from "react-query";
import {useEffect} from "react";
import {useExploreConfig} from "./useExploreConfig";

const refresh = async () => {
    await lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: '/refresh',
        body: undefined,
    })
}

export const useRefreshServer = () => {
    const { setError } = useExploreConfig()
    const queryClient = useQueryClient()
    const refreshMutation = useMutation<void,ApiError>({
        mutationKey: 'refresh',
        mutationFn: refresh,
        onSettled: () => {
            queryClient.invalidateQueries('status')
            queryClient.invalidateQueries('table')
            queryClient.setQueryData('status', 'loading')
        }
    })

    useEffect(() => {
        if (refreshMutation.error) {
            const [first, ...rest] = refreshMutation.error.error.message.split('\n')
            setError({title: first, text: rest.join('\n')})
        }
    }, [refreshMutation.error, setError])

    return refreshMutation
}