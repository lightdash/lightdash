import React, { FC, useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    AutoFitBigNumber,
    AutoFitBigNumberLabel,
    BigNumber,
    BigNumberContainer,
    BigNumberLabel,
} from './SimpleStatistics.styles';

type SimpleStatisticsProps = React.HTMLAttributes<HTMLDivElement>;

const SimpleStatistic: FC<SimpleStatisticsProps> = ({ ...wrapperProps }) => {
    const {
        resultsData,
        isLoading,
        minimal,
        bigNumberConfig: { bigNumber, bigNumberLabel, defaultLabel },
        isSqlRunner,
    } = useVisualizationContext();

    const [labelMaxSize, setLabelMaxSize] = useState(20);
    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <BigNumberContainer {...wrapperProps}>
            {minimal || isSqlRunner ? (
                <AutoFitBigNumber min={15} max={100} start={50}>
                    <BigNumber>{bigNumber}</BigNumber>
                </AutoFitBigNumber>
            ) : (
                <BigNumberContextMenu
                    renderTarget={({ ref, ...popoverProps }) => (
                        <AutoFitBigNumber
                            min={10}
                            max={100}
                            start={30}
                            onFontSize={(size: number) =>
                                size > 30
                                    ? setLabelMaxSize(size / 2.5)
                                    : undefined
                            }
                            hideOnCalc
                        >
                            <BigNumber
                                $interactive
                                ref={ref}
                                onClick={(popoverProps as any).onClick}
                            >
                                {bigNumber}
                            </BigNumber>
                        </AutoFitBigNumber>
                    )}
                />
            )}
            <AutoFitBigNumberLabel
                min={10}
                max={labelMaxSize}
                start={15}
                hideOnCalc
            >
                <BigNumberLabel>
                    {bigNumberLabel || defaultLabel}
                </BigNumberLabel>
            </AutoFitBigNumberLabel>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
