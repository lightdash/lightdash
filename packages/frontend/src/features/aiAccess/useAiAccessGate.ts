import { useMyAiAccess } from './api';

export const useAiAccessGate = (projectUuid: string | undefined) => {
    const { data } = useMyAiAccess(projectUuid);
    const refusal = data?.refusal;
    return { refusal, disabled: !!refusal };
};
