import { Box } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { Parameters } from '../../../../../features/parameters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';

const EmbedDashboardParameters: FC = () => {
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const handleParameterChange = useDashboardContext((c) => c.setParameter);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const areAllChartsLoaded = useDashboardContext((c) => c.areAllChartsLoaded);
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );

    const referencedParameters = useMemo(() => {
        return Object.fromEntries(
            Object.entries(parameterDefinitions).filter(([key]) =>
                parameterReferences.has(key),
            ),
        );
    }, [parameterDefinitions, parameterReferences]);

    return (
        <Box style={{ flexShrink: 0 }}>
            <Parameters
                isEditMode={false}
                parameterValues={parameterValues}
                onParameterChange={handleParameterChange}
                onClearAll={clearAllParameters}
                parameters={referencedParameters}
                isLoading={!areAllChartsLoaded}
                missingRequiredParameters={missingRequiredParameters}
            />
        </Box>
    );
};

export default EmbedDashboardParameters;
