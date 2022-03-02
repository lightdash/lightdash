import { Button } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { ChartType } from 'common';
import React, { useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ChartConfigTabs from './ChartConfigTabs';

export const ChartConfigPanel: React.FC = () => {
    const { chartType, plotData } = useVisualizationContext();
    const disabled =
        !plotData ||
        chartType === ChartType.BIG_NUMBER ||
        chartType === ChartType.TABLE;

    const [isOpen, setIsOpen] = useState(false);
    return (
        <Popover2
            content={<ChartConfigTabs />}
            interactionKind="click"
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
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
