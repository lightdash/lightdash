import { NonIdealState } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
    SimpleStatisticsWrapper,
} from './SimpleStatistics.styles';

type SimpleStatisticsProps = React.HTMLAttributes<HTMLDivElement>;

const SimpleStatistic: FC<SimpleStatisticsProps> = ({ ...wrapperProps }) => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: { bigNumber, bigNumberLabel, defaultLabel },
        isSqlRunner,
    } = useVisualizationContext();

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <SimpleStatisticsWrapper {...wrapperProps}>
            <BigNumberContainer>
                {isSqlRunner ? (
                    <BigNumber>{bigNumber}</BigNumber>
                ) : (
                    <BigNumberContextMenu
                        renderTarget={({ ref, isOpen: _isOpen, onClick }) => (
                            <BigNumber $interactive ref={ref} onClick={onClick}>
                                {bigNumber}
                            </BigNumber>
                        )}
                    />
                )}

                <BigNumberLabel>
                    {bigNumberLabel || defaultLabel}
                </BigNumberLabel>
            </BigNumberContainer>
        </SimpleStatisticsWrapper>
    ) : (
        <div style={{ padding: '50px 0' }} {...wrapperProps}>
            <NonIdealState
                title="No data available"
                description="Query metrics and dimensions with results."
                icon="chart"
            />
        </div>
    );
};

export default SimpleStatistic;
