import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

export const useDashboardParameterState = () => {
    const dashboardParameters = useDashboardContext((c) => c.parameters);
    const setParameter = useDashboardContext((c) => c.setParameter);

    // Filter out null and undefined values to match ParametersValuesMap type
    const parameterValues = Object.entries(dashboardParameters).reduce(
        (acc, [key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                acc[key] = value;
            }
            return acc;
        },
        {} as Record<string, string | string[]>,
    );

    const handleParameterChange = (
        paramKey: string,
        value: string | string[] | null,
    ) => {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
            // Remove parameter when cleared
            setParameter(paramKey, null);
        } else {
            setParameter(paramKey, value);
        }
    };

    const clearAllParameters = () => {
        // Clear all parameters by setting null values
        Object.keys(dashboardParameters).forEach((key) => {
            setParameter(key, null);
        });
    };

    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) => value !== null && value !== '' && value !== undefined,
    ).length;

    return {
        parameterValues,
        handleParameterChange,
        clearAllParameters,
        selectedParametersCount,
    };
};
