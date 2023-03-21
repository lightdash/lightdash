import { mergeRefs, useElementSize, useResizeObserver } from '@mantine/hooks';
import clamp from 'lodash-es/clamp';
import React, { FC, useMemo } from 'react';
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

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const VALUE_SIZE_MIN = 24;
const VALUE_SIZE_MAX = 64;

const LABEL_SIZE_MIN = 14;
const LABEL_SIZE_MAX = 32;

const calculateFontSize = (
    fontSizeMin: number,
    fontSizeMax: number,
    boundWidth: number,
) =>
    Math.floor(
        fontSizeMin +
            ((fontSizeMax - fontSizeMin) * (boundWidth - BOX_MIN_WIDTH)) /
                (BOX_MAX_WIDTH - BOX_MIN_WIDTH),
    );

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
    const { ref: elementSizeRef, ...elementSize } = useElementSize();
    const [resizeObserverRef, observerElementSize] = useResizeObserver();

    const { valueFontSize, labelFontSize } = useMemo(() => {
        const boundWidth = clamp(
            observerElementSize?.width || elementSize?.width || 0,
            BOX_MIN_WIDTH,
            BOX_MAX_WIDTH,
        );

        const valueSize = calculateFontSize(
            VALUE_SIZE_MIN,
            VALUE_SIZE_MAX,
            boundWidth,
        );

        const labelSize = calculateFontSize(
            LABEL_SIZE_MIN,
            LABEL_SIZE_MAX,
            boundWidth,
        );

        return {
            valueFontSize: valueSize,
            labelFontSize: labelSize,
        };
    }, [elementSize, observerElementSize]);

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <BigNumberContainer
            ref={mergeRefs(elementSizeRef, resizeObserverRef)}
            {...wrapperProps}
        >
            {minimal || isSqlRunner ? (
                <BigNumber $fontSize={valueFontSize}>{bigNumber}</BigNumber>
            ) : (
                <BigNumberContextMenu
                    renderTarget={({ ref, onClick }) => (
                        <BigNumber
                            $interactive
                            ref={ref}
                            onClick={onClick}
                            $fontSize={valueFontSize}
                        >
                            {bigNumber}
                        </BigNumber>
                    )}
                />
            )}

            <BigNumberLabel $fontSize={labelFontSize}>
                {bigNumberLabel || defaultLabel}
            </BigNumberLabel>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
