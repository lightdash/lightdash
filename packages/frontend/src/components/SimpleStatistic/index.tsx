import { NonIdealState } from '@blueprintjs/core';
import { findFieldByIdInExplore, friendlyName, getFieldLabel } from 'common';
import React, { FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

const SimpleStatistic: FC = () => {
    const {
        cartesianConfig: { dirtyEchartsConfig },
        resultsData,
    } = useVisualizationContext();

    const { bigNumber, bigNumberLabel } = useBigNumberConfig();

    const validData = bigNumber && resultsData?.rows.length && bigNumberLabel;
    const validLabel = dirtyEchartsConfig?.yAxis?.[0]?.name
        ? dirtyEchartsConfig?.yAxis?.[0]?.name
        : bigNumberLabel;

    return (
        <>
            {validData ? (
                <SimpleStatisticsWrapper>
                    <BigNumberContainer>
                        <BigNumber>{bigNumber}</BigNumber>
                        <BigNumberLabel>{validLabel}</BigNumberLabel>
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
