import useApp from '../../../providers/App/useApp';
import { useChartStudioAvailable } from './useChartStudioAvailable';

/** Chart Studio, or a valid licence; authoring checks useChartStudioAvailable alone. */
export const useChartTypesEnabled = () => {
    const { health } = useApp();
    const isLicensed = health.data?.license?.valid === true;
    const chartStudioAvailable = useChartStudioAvailable();
    const enabled = chartStudioAvailable || isLicensed;
    return {
        isLoading: !enabled && health.isLoading,
        enabled,
    };
};
