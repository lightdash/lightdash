import React, { FC } from 'react';
import { Textfit } from 'react-textfit';
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
                <Textfit mode="single" style={{ width: '45%' }} max={100}>
                    <BigNumber>{bigNumber}</BigNumber>
                </Textfit>
            ) : (
                <BigNumberContextMenu
                    renderTarget={({ ref, ...popoverProps }) => (
                        <Textfit
                            mode="single"
                            style={{ width: '45%' }}
                            max={100}
                        >
                            <BigNumber
                                $interactive
                                ref={ref}
                                onClick={(popoverProps as any).onClick}
                            >
                                {bigNumber}
                            </BigNumber>
                        </Textfit>
                    )}
                />
            )}
            <Textfit mode="single" style={{ width: '80%' }} max={20}>
                <BigNumberLabel>
                    {bigNumberLabel || defaultLabel}
                </BigNumberLabel>
            </Textfit>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
