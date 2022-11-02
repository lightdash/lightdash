import { Collapse, CollapseProps } from '@blueprintjs/core';
import { FC, memo } from 'react';
import styled from 'styled-components';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import LightdashVisualization from '../../LightdashVisualization';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { StyledCollapse } from '../Explorer.styles';
import { SeriesContextMenu } from './SeriesContextMenu';

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

    const isOpen = expandedSections.includes(ExplorerSection.VISUALIZATION);
    const isOnlyExpandedCard = isOpen && expandedSections.length === 1;

    return (
        <StyledCollapse
            data-testid="visualization-card-body"
            isOpen={isOpen}
            $flexGrow={isOnlyExpandedCard ? 1 : undefined}
        >
            <LightdashVisualization className="cohere-block" />

            <SeriesContextMenu
                echartSeriesClickEvent={echartsClickEvent?.event}
                dimensions={echartsClickEvent?.dimensions}
                series={echartsClickEvent?.series}
            />
        </StyledCollapse>
    );
});

export default VisualizationCardBody;
