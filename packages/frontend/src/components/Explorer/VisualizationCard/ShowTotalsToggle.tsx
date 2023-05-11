import { FC } from 'react';

import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { StyledSwitch } from './ShowTotalsToggle.styles';

const ShowTotalsToggle: FC = () => {
    const {
        tableConfig: {
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            canUseMetricsAsRows,
            metricsAsRows,
        },
    } = useVisualizationContext();

    const options =
        canUseMetricsAsRows && metricsAsRows
            ? {
                  label: 'Show row total',
                  value: showRowCalculation,
                  onChange: () => setShowRowCalculation(!showRowCalculation),
              }
            : {
                  label: 'Show column total',
                  value: showColumnCalculation,
                  onChange: () =>
                      setShowColumnCalculation(!showColumnCalculation),
              };

    return (
        <StyledSwitch
            large
            id="showTotals"
            innerLabelChecked="Yes"
            innerLabel="No"
            alignIndicator="right"
            label={options.label}
            checked={options.value}
            onChange={options.onChange}
        />
    );
};

export default ShowTotalsToggle;
