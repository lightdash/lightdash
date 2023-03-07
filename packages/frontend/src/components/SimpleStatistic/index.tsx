import React, { FC } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
} from './SimpleStatistics.styles';

interface SimpleStatisticsProps extends React.HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
}

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    ...wrapperProps
}) => {
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
            {minimal || isSqlRunner ? (
                <BigNumber>{bigNumber}</BigNumber>
            ) : (
                <BigNumberContextMenu
                    renderTarget={({ ref, onClick }) => (
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
