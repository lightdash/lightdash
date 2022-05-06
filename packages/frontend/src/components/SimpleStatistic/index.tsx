import { NonIdealState } from '@blueprintjs/core';
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
        bigNumberConfig: { bigNumber, bigNumberLabel },
    } = useVisualizationContext();

    const validData = bigNumber && resultsData?.rows.length && bigNumberLabel;

    if (isLoading) return <LoadingChart />;

    return (
        <>
            {validData ? (
                <SimpleStatisticsWrapper>
                    <BigNumberContainer>
                        <BigNumber>{bigNumber}</BigNumber>
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
