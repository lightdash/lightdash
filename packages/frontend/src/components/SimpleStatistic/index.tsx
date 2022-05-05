import { NonIdealState } from '@blueprintjs/core';
import { formatValue } from 'common';
import React, { FC } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

const SimpleStatistic: FC = () => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: { bigNumber, bigNumberLabel, bigNumberStyle, field },
    } = useVisualizationContext();

    const validData = bigNumber && resultsData?.rows.length && bigNumberLabel;

    if (isLoading) return <LoadingChart />;

    console.log('field', field);
    console.log('bigNumberStyle', bigNumberStyle);
    console.log('formattedBigNumber', bigNumber);

    const formattedBigNumber = formatValue(
        field?.format,
        field?.round,
        bigNumber,
        bigNumberStyle,
    );
    console.log('formattedBigNumber', formattedBigNumber);

    return (
        <>
            {validData ? (
                <SimpleStatisticsWrapper>
                    <BigNumberContainer>
                        <BigNumber>{formattedBigNumber}</BigNumber>
                        <BigNumberLabel>{bigNumberLabel}</BigNumberLabel>
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
