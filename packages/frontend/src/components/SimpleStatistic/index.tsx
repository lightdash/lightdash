import React, { FC } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

interface Props {
    data: ChartConfig;
}

const SimpleStatistic: FC<Props> = ({ data }) => {
    if (!data.plotData) return null;
    const metricKey = data.series[0];
    const bigNumberLabel = data.metricOptions[0].label;

    const bigNumber = Math.max(...data.plotData.map((o) => o[metricKey]));

    return (
        <SimpleStatisticsWrapper>
            <BigNumberContainer>
                <BigNumberLabel>{bigNumberLabel}</BigNumberLabel>
                <BigNumber>{bigNumber}</BigNumber>
            </BigNumberContainer>
        </SimpleStatisticsWrapper>
    );
};

export default SimpleStatistic;
