import { Collapse } from '@blueprintjs/core';
import { FC, memo, useMemo } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import LightdashVisualization from '../../LightdashVisualization';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { SeriesContextMenu } from './SeriesContextMenu';
import { VisualizationCardContentWrapper } from './VisualizationCard.styles';

export type EchartsClickEvent = {
    event: EchartSeriesClickEvent;
    dimensions: string[];
    series: EChartSeries[];
};

const VisualizationCardBody: FC<{
    echartsClickEvent: EchartsClickEvent | undefined;
}> = memo(({ echartsClickEvent }) => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const vizIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.VISUALIZATION),
        [expandedSections],
    );

    return (
        <Collapse className="explorer-chart" isOpen={vizIsOpen}>
            <VisualizationCardContentWrapper className="cohere-block">
                <LightdashVisualization />

                <SeriesContextMenu
                    echartSeriesClickEvent={echartsClickEvent?.event}
                    dimensions={echartsClickEvent?.dimensions}
                    series={echartsClickEvent?.series}
                />
            </VisualizationCardContentWrapper>
        </Collapse>
    );
});

export default VisualizationCardBody;
