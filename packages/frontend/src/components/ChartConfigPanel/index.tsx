import { Button } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ChartType } from 'common';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ChartConfigTabs from './ChartConfigTabs';

export const ChartConfigPanel: React.FC = () => {
    const { chartType, plotData } = useVisualizationContext();
    const disabled = !plotData || chartType === ChartType.TABLE;

    const [isOpen, setIsOpen] = useState(false);
    return (
        <Popover2
            content={<ChartConfigTabs />}
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            lazy={false}
            disabled={disabled}
        >
            <Button
                minimal
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};

export default ChartConfigPanel;
