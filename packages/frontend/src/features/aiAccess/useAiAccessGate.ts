import { useMyAiAccess } from './api';

export const useAiAccessGate = (projectUuid: string | undefined) => {
    const {
        data,
        isLoading: isInitialLoading,
        isFetching,
        isError,
        refetch,
    } = useMyAiAccess(projectUuid);
    const isLoading = isInitialLoading || isFetching;
    const refusal = data?.refusal;
    return {
        refusal,
        isLoading,
        isError,
        refetch,
        disabled: isLoading || isError || !!refusal,
    };
};
