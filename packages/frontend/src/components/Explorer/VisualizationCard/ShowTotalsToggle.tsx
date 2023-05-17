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
            canUsePivotTable,
        },
    } = useVisualizationContext();

    const rowTotalOption = canUsePivotTable
        ? {
              label: 'Show row total',
              value: showRowCalculation,
              onChange: () => setShowRowCalculation(!showRowCalculation),
          }
        : undefined;

    const columnTotalOption = {
        label: 'Show column total',
        value: showColumnCalculation,
        onChange: () => setShowColumnCalculation(!showColumnCalculation),
    };

    return (
        <>
            {rowTotalOption ? (
                <StyledSwitch
                    large
                    id="showTotals"
                    innerLabelChecked="Yes"
                    innerLabel="No"
                    alignIndicator="right"
                    label={rowTotalOption.label}
                    checked={rowTotalOption.value}
                    onChange={rowTotalOption.onChange}
                />
            ) : null}

            <StyledSwitch
                large
                id="showTotals"
                innerLabelChecked="Yes"
                innerLabel="No"
                alignIndicator="right"
                label={columnTotalOption.label}
                checked={columnTotalOption.value}
                onChange={columnTotalOption.onChange}
            />
        </>
    );
};

export default ShowTotalsToggle;
