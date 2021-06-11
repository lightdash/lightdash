import React from 'react';
import { Popover2, Classes } from "@blueprintjs/popover2";
import {
    Alignment,
    Button,
    ButtonGroup,
    Divider,
    Switch
} from "@blueprintjs/core";
import {useState} from "react";
import {ChartConfig} from "../hooks/useChartConfig";
import {friendlyName} from "common";

type ContentProps = {
    chartConfig: ChartConfig,
}

const Content = ({ chartConfig }: ContentProps) => {
    return (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', width: '300px'}}>
            <span><b>Metrics</b></span>
            <Divider />
            {chartConfig.metricOptions.map((metric, idx) => (
                <div key={idx} style={{width: '100%'}}>
                    <Switch
                        checked={chartConfig.seriesLayout.yMetrics?.find(m => m===metric) !== undefined}
                        label={friendlyName(metric)}
                        alignIndicator={Alignment.RIGHT}
                        onChange={e => chartConfig.toggleYMetric(metric)}
                        disabled={(chartConfig.seriesLayout.yMetrics?.find(m => m===metric) === undefined) && chartConfig.seriesLayout.groupDimension !== undefined}
                    />
                </div>
            ))}
            <span><b>Dimensions</b></span>
            <Divider />
            {chartConfig.dimensionOptions.map(dimension => (
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                    <span>{friendlyName(dimension)}</span>
                    <ButtonGroup minimal={true}>
                        <Button
                            outlined={true}
                            active={dimension === chartConfig.seriesLayout.xDimension}
                            onClick={() => chartConfig.setXDimension(dimension)}
                        >X-axis</Button>
                        <Button
                            outlined={true}
                            active={dimension === chartConfig.seriesLayout.groupDimension}
                            onClick={() => chartConfig.setGroupDimension(dimension === chartConfig.seriesLayout.groupDimension ? undefined : dimension)}
                            disabled={chartConfig.seriesLayout.yMetrics && chartConfig.seriesLayout.yMetrics.length > 1}
                        >Group</Button>
                    </ButtonGroup>
                </div>
            ))}
        </div>
    )
}

type ChartConfigPanelProps = {
    chartConfig: ChartConfig,
}
export const ChartConfigPanel = ({ chartConfig }: ChartConfigPanelProps) => {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <Popover2
            content={<Content chartConfig={chartConfig}/>}
            interactionKind={'click'}
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position={'bottom'}
            lazy={false}
        >
            <Button icon={'settings'} rightIcon={'caret-down'} text='Configure' />
        </Popover2>
    )
}