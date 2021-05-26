import {lightdashApi} from "../api";
import {ApiRefreshResults} from "common";
import { useMutation, useQueryClient } from "react-query";

const refresh = async () => {
    await lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: '/refresh',
        body: undefined,
    })
}

export const useRefreshServer = () => {
    const queryClient = useQueryClient()
    const refreshMutation = useMutation({
        mutationKey: 'refresh',
        mutationFn: refresh,
        onSettled: () => {
            queryClient.invalidateQueries('status')
            queryClient.invalidateQueries('table')
            queryClient.setQueryData('status', 'loading')
        }
    })
    return refreshMutation
}