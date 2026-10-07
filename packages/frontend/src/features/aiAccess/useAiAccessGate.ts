import { useMyAiAccess } from './api';

export const useAiAccessGate = (projectUuid: string | undefined) => {
    const { data, isLoading, isError, refetch } = useMyAiAccess(projectUuid);
    const refusal = data?.refusal;
    return {
        refusal,
        isLoading,
        isError,
        refetch,
        disabled: isLoading || isError || !!refusal,
    };
};
