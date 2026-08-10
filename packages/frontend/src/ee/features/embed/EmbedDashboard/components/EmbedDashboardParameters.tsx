import { Box, Group, Text } from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import FilterGroupSeparator from '../../../../../features/dashboardFilters/FilterGroupSeparator';
import { Parameters } from '../../../../../features/parameters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../../../providers/Dashboard/useDashboardTileStatusContext';
import { embedContractClass } from '../../styles/embedClassContract';

const parametersSeparator: ReactNode = (
    <FilterGroupSeparator
        icon={IconAdjustmentsHorizontal}
        tooltipLabel={
            <Box>
                <Text fw={500} fz="xs">
                    Parameters
                </Text>
                <Text fz="xs">
                    Adjust preset inputs that change how the dashboard's numbers
                    are calculated.
                </Text>
            </Box>
        }
    />
);

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
    const areAllChartsLoaded = useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    );
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
        <Group
            className={embedContractClass('ld-dashboard-parameters')}
            gap="xs"
            wrap="wrap"
        >
            <Parameters
                isEditMode={false}
                parameterValues={parameterValues}
                onParameterChange={handleParameterChange}
                onClearAll={clearAllParameters}
                parameters={referencedParameters}
                isLoading={!areAllChartsLoaded}
                missingRequiredParameters={missingRequiredParameters}
                triggerClassName={embedContractClass('ld-dashboard-parameter')}
                dropdownClassName={embedContractClass(
                    'ld-dashboard-parameter-dropdown',
                )}
                separator={parametersSeparator}
            />
        </Group>
    );
};

export default EmbedDashboardParameters;
