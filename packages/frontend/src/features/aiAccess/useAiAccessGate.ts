import { useMyAiAccess } from './api';

export const useAiAccessGate = (projectUuid: string | undefined) => {
    const { data, isLoading } = useMyAiAccess(projectUuid);
    const refusal = data?.refusal;
    return { refusal, isLoading, disabled: isLoading || !!refusal };
};
