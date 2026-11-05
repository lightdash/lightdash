import useApp from '../../../providers/App/useApp';

/**
 * Chart Studio (authoring custom chart types) needs a configured app runtime.
 * The backend only reports one when the licence is valid.
 */
export const useChartStudioAvailable = (): boolean => {
    const { health } = useApp();
    return health.data?.dataApps.runtimeAvailable === true;
};
