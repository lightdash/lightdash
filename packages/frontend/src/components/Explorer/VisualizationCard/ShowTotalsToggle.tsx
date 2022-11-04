import { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { StyledSwitch } from './ShowTotalsToggle.styles';

const ShowTotalsToggle: FC = () => {
    const {
        tableConfig: { showColumnCalculation, setShowColumnCalculation },
    } = useVisualizationContext();
    return (
        <StyledSwitch
            large
            id="showTotals"
            innerLabelChecked="Yes"
            innerLabel="No"
            label="Show column total"
            alignIndicator="right"
            checked={showColumnCalculation}
            onChange={(e) => {
                setShowColumnCalculation(!showColumnCalculation);
            }}
        />
    );
};

export default ShowTotalsToggle;
