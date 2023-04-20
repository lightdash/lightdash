import clamp from 'lodash-es/clamp';
import { FC, HTMLAttributes, useMemo } from 'react';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import {
    TILE_HEADER_HEIGHT,
    TILE_HEADER_MARGIN_BOTTOM,
} from '../DashboardTiles/TileBase/TileBase.styles';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import { BigNumberContextMenu } from './BigNumberContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberHalf,
    BigNumberLabel,
} from './SimpleStatistics.styles';

interface SimpleStatisticsProps extends HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    isDashboard?: boolean;
    isTitleHidden?: boolean;
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
    isDashboard = false,
    isTitleHidden = false,
    ...wrapperProps
}) => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: { bigNumber, bigNumberLabel, defaultLabel },
        isSqlRunner,
    } = useVisualizationContext();

    const [setRef, observerElementSize] = useResizeObserver();

    const { valueFontSize, labelFontSize } = useMemo(() => {
        const boundWidth = clamp(
            observerElementSize?.width || 0,
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
    }, [observerElementSize]);

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <BigNumberContainer
            $paddingBottom={
                isDashboard && isTitleHidden
                    ? TILE_HEADER_HEIGHT + TILE_HEADER_MARGIN_BOTTOM - 8
                    : TILE_HEADER_HEIGHT
            }
            ref={(elem) => setRef(elem)}
            {...wrapperProps}
        >
            <BigNumberHalf>
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
            </BigNumberHalf>

            <BigNumberHalf>
                <BigNumberLabel $fontSize={labelFontSize}>
                    {bigNumberLabel || defaultLabel}
                </BigNumberLabel>
            </BigNumberHalf>
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
