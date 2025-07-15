import { useState } from 'react';

export const useParameterState = () => {
    const [parameterValues, setParameterValues] = useState<
        Record<string, string | null>
    >({});

    const handleParameterChange = (paramKey: string, value: string | null) => {
        setParameterValues((prev) => ({
            ...prev,
            [paramKey]: value,
        }));
    };

    const clearAllParameters = () => {
        setParameterValues({});
    };

    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) => value !== null && value !== '',
    ).length;

    return {
        parameterValues,
        handleParameterChange,
        clearAllParameters,
        selectedParametersCount,
    };
};
