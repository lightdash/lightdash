import { Switch } from '@blueprintjs/core';
import { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ShowTotalsToggleWrapper } from './ShowTotalsToggle.styles';

const ShowTotalsToggle: FC = () => {
    const {
        tableConfig: { showColumnCalculation, setShowColumnCalculation },
    } = useVisualizationContext();
    return (
        <ShowTotalsToggleWrapper>
            <Switch
                large
                innerLabelChecked="Yes"
                innerLabel="No"
                label={'Show column total'}
                alignIndicator={'right'}
                checked={showColumnCalculation}
                onChange={(e) => {
                    setShowColumnCalculation(!showColumnCalculation);
                }}
            />
        </ShowTotalsToggleWrapper>
    );
};

export default ShowTotalsToggle;
