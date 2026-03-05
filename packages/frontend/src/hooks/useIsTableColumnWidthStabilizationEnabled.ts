import useHealth from './health/useHealth';

export function useIsTableColumnWidthStabilizationEnabled(): boolean {
    const health = useHealth();
    return health.data?.tableColumnWidthStabilization.enabled ?? false;
}
