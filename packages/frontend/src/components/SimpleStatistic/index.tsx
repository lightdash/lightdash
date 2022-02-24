import { NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import bigNumberConfig from '../../utils/bigNumberConfig';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

const SimpleStatistic: FC = () => {
    const { resultsData, chartConfig } = useVisualizationContext();
    const label =
        chartConfig?.metricOptions[0] && chartConfig?.metricOptions[0].label;
    const bigNumber = bigNumberConfig(resultsData);
    const validData = bigNumber && resultsData?.rows.length && label;
    return (
        <>
            {validData ? (
                <SimpleStatisticsWrapper>
                    <BigNumberContainer>
                        {label && <BigNumberLabel>{label}</BigNumberLabel>}
                        <BigNumber>{bigNumber}</BigNumber>
                    </BigNumberContainer>
                </SimpleStatisticsWrapper>
            ) : (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState
                        title="No data available"
                        description="Query metrics and dimensions with results."
                        icon="chart"
                    />
                </div>
            )}
        </>
    );
};

export default SimpleStatistic;
