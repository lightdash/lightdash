import { Colors } from '@blueprintjs/core';
import { ComparisonDiffTypes } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import clamp from 'lodash-es/clamp';
import { FC, HTMLAttributes, useMemo } from 'react';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import MantineIcon from '../common/MantineIcon';
import { TILE_HEADER_HEIGHT } from '../DashboardTiles/TileBase/TileBase.styles';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import BigNumberContextMenu from './BigNumberContextMenu';
import BigNumberDashboardContextMenu from './BigNumberDashboardContextMenu';
import {
    BigNumber,
    BigNumberContainer,
    BigNumberHalf,
    BigNumberLabel,
} from './SimpleStatistics.styles';

interface SimpleStatisticsProps extends HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    isTitleHidden?: boolean;
    isDashboard?: boolean;
    tileUuid?: string;
}

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const BOX_MIN_HEIGHT = 25;
const BOX_MAX_HEIGHT = 1000;

const VALUE_SIZE_MIN = 24;
const VALUE_SIZE_MAX = 64;

const LABEL_SIZE_MIN = 14;
const LABEL_SIZE_MAX = 32;

const COMPARISON_VALUE_SIZE_MIN = 12;
const COMPARISON_VALUE_SIZE_MAX = 22;

const calculateFontSize = (
    fontSizeMin: number,
    fontSizeMax: number,
    boundWidth: number,
    boundHeight: number,
) => {
    const widthScale =
        (boundWidth - BOX_MIN_WIDTH) / (BOX_MAX_WIDTH - BOX_MIN_WIDTH);
    const heightScale =
        (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

    const scalingFactor = Math.min(widthScale, heightScale);

    // assert : 0 <= scalingFactor <= 1

    const fontSize = Math.floor(
        fontSizeMin + (fontSizeMax - fontSizeMin) * scalingFactor,
    );

    return fontSize;
};

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    isTitleHidden = false,
    isDashboard = false,
    tileUuid,
    ...wrapperProps
}) => {
    const {
        resultsData,
        isLoading,
        bigNumberConfig: {
            bigNumber,
            bigNumberLabel,
            defaultLabel,
            comparisonValue,
            showComparison,
            showBigNumberLabel,
            comparisonDiff,
            flipColors,
            comparisonTooltip,
            comparisonLabel,
        },
        isSqlRunner,
    } = useVisualizationContext();

    const [setRef, observerElementSize] = useResizeObserver();

    const { valueFontSize, labelFontSize, comparisonFontSize } = useMemo(() => {
        const boundWidth = clamp(
            observerElementSize?.width || 0,
            BOX_MIN_WIDTH,
            BOX_MAX_WIDTH,
        );

        const boundHeight = clamp(
            observerElementSize?.height || 0,
            BOX_MIN_HEIGHT,
            BOX_MAX_HEIGHT,
        );

        const valueSize = calculateFontSize(
            VALUE_SIZE_MIN,
            VALUE_SIZE_MAX,
            boundWidth,
            boundHeight,
        );

        const labelSize = calculateFontSize(
            LABEL_SIZE_MIN,
            LABEL_SIZE_MAX,
            boundWidth,
            boundHeight,
        );

        const comparisonValueSize = calculateFontSize(
            COMPARISON_VALUE_SIZE_MIN,
            COMPARISON_VALUE_SIZE_MAX,
            boundWidth,
            boundHeight,
        );

        return {
            valueFontSize: valueSize,
            labelFontSize: labelSize,
            comparisonFontSize: comparisonValueSize,
        };
    }, [observerElementSize]);

    const comparisonValueColor = useMemo(() => {
        switch (comparisonDiff) {
            case ComparisonDiffTypes.NAN:
            case ComparisonDiffTypes.UNDEFINED:
                return Colors.GRAY3;
            case ComparisonDiffTypes.POSITIVE:
                return flipColors ? Colors.RED3 : Colors.GREEN3;
            case ComparisonDiffTypes.NEGATIVE:
                return flipColors ? Colors.GREEN3 : Colors.RED3;
            case ComparisonDiffTypes.NONE:
                return 'inherit';
        }
    }, [comparisonDiff, flipColors]);

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <BigNumberContainer
            $paddingBottom={
                isDashboard && isTitleHidden ? 0 : TILE_HEADER_HEIGHT
            }
            ref={(elem) => setRef(elem)}
            {...wrapperProps}
        >
            <BigNumberHalf>
                {minimal || isSqlRunner ? (
                    <BigNumber $fontSize={valueFontSize}>{bigNumber}</BigNumber>
                ) : isDashboard && tileUuid ? (
                    <BigNumberDashboardContextMenu tileUuid={tileUuid}>
                        <BigNumber $interactive $fontSize={valueFontSize}>
                            {bigNumber}
                        </BigNumber>
                    </BigNumberDashboardContextMenu>
                ) : (
                    <BigNumberContextMenu>
                        <BigNumber $interactive $fontSize={valueFontSize}>
                            {bigNumber}
                        </BigNumber>
                    </BigNumberContextMenu>
                )}
            </BigNumberHalf>

            {showBigNumberLabel ? (
                <BigNumberHalf>
                    <BigNumberLabel $fontSize={labelFontSize}>
                        {bigNumberLabel || defaultLabel}
                    </BigNumberLabel>
                </BigNumberHalf>
            ) : null}

            {showComparison ? (
                <BigNumberHalf
                    style={{
                        marginTop: 10,
                    }}
                >
                    <Tooltip withinPortal label={comparisonTooltip}>
                        <BigNumber
                            $fontSize={comparisonFontSize}
                            style={{
                                color: comparisonValueColor,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            {comparisonValue}
                            {comparisonDiff === ComparisonDiffTypes.POSITIVE ? (
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    size={18}
                                    style={{
                                        display: 'inline',
                                        margin: '0 7px 0 0',
                                    }}
                                />
                            ) : comparisonDiff ===
                              ComparisonDiffTypes.NEGATIVE ? (
                                <MantineIcon
                                    icon={IconArrowDownRight}
                                    size={18}
                                    style={{
                                        display: 'inline',
                                        margin: '0 7px 0 0',
                                    }}
                                />
                            ) : (
                                <span style={{ margin: '0 7px 0 0' }} />
                            )}
                        </BigNumber>
                    </Tooltip>
                    <BigNumberLabel $fontSize={comparisonFontSize}>
                        {comparisonLabel ?? null}
                    </BigNumberLabel>
                </BigNumberHalf>
            ) : null}
        </BigNumberContainer>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
