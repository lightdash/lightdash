import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

export const useParameterState = () => {
    const parameterValues = useDashboardContext((c) => c.parameters);
    const setParameter = useDashboardContext((c) => c.setParameter);

    const handleParameterChange = (
        paramKey: string,
        value: string | string[] | null,
    ) => {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
            // Remove parameter when cleared
            const newParams = { ...parameterValues };
            delete newParams[paramKey];
            setParameter(paramKey, ''); // or handle removal differently
        } else {
            setParameter(paramKey, value);
        }
    };

    const clearAllParameters = () => {
        // Clear all parameters by setting empty values
        Object.keys(parameterValues).forEach((key) => {
            setParameter(key, '');
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
