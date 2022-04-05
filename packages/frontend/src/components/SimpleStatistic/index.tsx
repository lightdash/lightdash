import { NonIdealState } from '@blueprintjs/core';
import { findFieldByIdInExplore, friendlyName, getFieldLabel } from 'common';
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
    const {
        cartesianConfig: { dirtyEchartsConfig },
        resultsData,
        explore,
    } = useVisualizationContext();
    const fieldId = resultsData?.metricQuery.metrics[0];

    let label: string | undefined;

    if (fieldId) {
        const field = explore
            ? findFieldByIdInExplore(explore, fieldId)
            : undefined;
        label = field ? getFieldLabel(field) : friendlyName(fieldId);
    }

    const bigNumber = bigNumberConfig(resultsData);
    const validData = bigNumber && resultsData?.rows.length && label;
    const validLabel = dirtyEchartsConfig?.yAxis?.[0]?.name
        ? dirtyEchartsConfig?.yAxis?.[0]?.name
        : label;

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
