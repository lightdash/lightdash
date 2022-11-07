import React, { FC } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
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
        <BigNumberContainer {...wrapperProps}>
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

            <BigNumberLabel>{bigNumberLabel || defaultLabel}</BigNumberLabel>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
