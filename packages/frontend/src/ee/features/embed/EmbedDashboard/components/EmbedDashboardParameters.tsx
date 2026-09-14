import { type ParameterDefinitions } from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import FilterGroupSeparator from '../../../../../features/dashboardFilters/FilterGroupSeparator';
import { Parameters } from '../../../../../features/parameters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../../../providers/Dashboard/useDashboardTileStatusContext';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
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

type Props = {
    /** Parameters referenced by the charts on the active tab */
    parameters: ParameterDefinitions;
};

const EmbedDashboardParameters: FC<Props> = ({ parameters }) => {
    const getUiString = useUiStrings();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const handleParameterChange = useDashboardContext((c) => c.setParameter);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const areAllChartsLoaded = useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    );
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );

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
                parameters={parameters}
                isLoading={!areAllChartsLoaded}
                missingRequiredParameters={missingRequiredParameters}
                triggerClassName={embedContractClass('ld-dashboard-parameter')}
                dropdownClassName={embedContractClass(
                    'ld-dashboard-parameter-dropdown',
                )}
                separator={parametersSeparator}
                getUiString={getUiString}
            />
        </Group>
    );
};

export default EmbedDashboardParameters;
