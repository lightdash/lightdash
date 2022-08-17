import { Label, Switch } from '@blueprintjs/core';
import { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ShowTotalsToggleWrapper } from './ShowTotalsToggle.styles';

const ShowTotalsToggle: FC = () => {
    const {
        tableConfig: { showColumnCalculation, setShowColumnCalculation },
    } = useVisualizationContext();
    return (
        <ShowTotalsToggleWrapper>
            <Label>Show column total</Label>
            <Switch
                large
                innerLabelChecked="Yes"
                innerLabel="No"
                checked={showColumnCalculation}
                onChange={(e) => {
                    setShowColumnCalculation(!showColumnCalculation);
                }}
            />
        </ShowTotalsToggleWrapper>
    );
};

export default ShowTotalsToggle;
