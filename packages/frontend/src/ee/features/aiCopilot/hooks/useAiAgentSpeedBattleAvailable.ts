import useHealth from '../../../../hooks/health/useHealth';

export const useAiAgentSpeedBattleAvailable = (): boolean => {
    const health = useHealth();
    return health.data?.ai.fastDecisionsEnabled === true;
};
