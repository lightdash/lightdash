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

    return (
        <>
            {canUsePivotTable ? (
                <StyledSwitch
                    large
                    id="showTotals"
                    innerLabelChecked="Yes"
                    innerLabel="No"
                    alignIndicator="right"
                    label="Show row total"
                    checked={showRowCalculation}
                    onChange={() => setShowRowCalculation(!showRowCalculation)}
                />
            ) : null}

            <StyledSwitch
                large
                id="showTotals"
                innerLabelChecked="Yes"
                innerLabel="No"
                alignIndicator="right"
                label="Show column total"
                checked={showColumnCalculation}
                onChange={() =>
                    setShowColumnCalculation(!showColumnCalculation)
                }
            />
        </>
    );
};

export default ShowTotalsToggle;
