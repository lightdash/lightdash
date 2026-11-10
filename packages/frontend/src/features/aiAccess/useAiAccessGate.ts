import { useMyAiAccess } from './api';

export const useAiAccessGate = (projectUuid: string | undefined) => {
    const {
        data,
        isLoading: isInitialLoading,
        isFetching,
        isError,
        refetch,
        isAccessRequired,
    } = useMyAiAccess(projectUuid);
    const isLoading = isInitialLoading || isFetching;
    const refusal = isAccessRequired ? data?.refusal : null;
    return {
        refusal,
        isLoading,
        isError,
        refetch,
        disabled: isLoading || isError || refusal !== null,
    };
};
