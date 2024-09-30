import { ComparisonDiffTypes } from '@lightdash/common';
import {
    Center,
    Flex,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
    type TextProps,
} from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import clamp from 'lodash/clamp';
import { forwardRef, useMemo, type FC, type HTMLAttributes } from 'react';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import MantineIcon from '../common/MantineIcon';
import { TILE_HEADER_HEIGHT } from '../DashboardTiles/TileBase/TileBase.styles';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/VisualizationBigNumberConfig';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import BigNumberContextMenu from './BigNumberContextMenu';

interface SimpleStatisticsProps extends HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    isTitleHidden?: boolean;
    isDashboard?: boolean;
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

const BigNumberText: FC<TextProps> = forwardRef<HTMLDivElement, TextProps>(
    ({ children, ...textProps }, ref) => {
        return (
            <Text
                ref={ref}
                c="dark.4"
                align="center"
                fw={500}
                {...textProps}
                style={{
                    transition: 'font-size 0.1s ease-in-out',
                    ...textProps.style,
                }}
            >
                {children}
            </Text>
        );
    },
);

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    isTitleHidden = false,
    isDashboard = false,
    ...wrapperProps
}) => {
    const theme = useMantineTheme();

    const { resultsData, isLoading, visualizationConfig, isSqlRunner } =
        useVisualizationContext();

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

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
        if (!isBigNumber) return undefined;

        const { comparisonDiff, flipColors } = visualizationConfig.chartConfig;

        switch (comparisonDiff) {
            case ComparisonDiffTypes.NAN:
            case ComparisonDiffTypes.UNDEFINED:
                return theme.colors.gray[5];
            case ComparisonDiffTypes.POSITIVE:
                return flipColors ? theme.colors.red[7] : theme.colors.green[8];
            case ComparisonDiffTypes.NEGATIVE:
                return flipColors ? theme.colors.green[8] : theme.colors.red[7];
            case ComparisonDiffTypes.NONE:
                return 'inherit';
        }
    }, [
        isBigNumber,
        theme.colors.gray,
        theme.colors.green,
        theme.colors.red,
        visualizationConfig.chartConfig,
    ]);

    if (!isBigNumber) return null;

    const {
        bigNumber,
        showBigNumberLabel,
        bigNumberLabel,
        defaultLabel,
        showComparison,
        comparisonTooltip,
        comparisonLabel,
        comparisonValue,
        comparisonDiff,
    } = visualizationConfig.chartConfig;

    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    return validData ? (
        <Center
            w="100%"
            h="100%"
            component={Stack}
            spacing={0}
            pb={isDashboard && isTitleHidden ? 0 : TILE_HEADER_HEIGHT}
            ref={(elem) => setRef(elem)}
            {...wrapperProps}
        >
            <Flex style={{ flexShrink: 1 }}>
                {minimal || isSqlRunner ? (
                    <BigNumberText fz={valueFontSize}>
                        {bigNumber}
                    </BigNumberText>
                ) : (
                    <BigNumberContextMenu>
                        <BigNumberText
                            fz={valueFontSize}
                            style={{ cursor: 'pointer' }}
                        >
                            {bigNumber}
                        </BigNumberText>
                    </BigNumberContextMenu>
                )}
            </Flex>

            {showBigNumberLabel ? (
                <Flex style={{ flexShrink: 1 }}>
                    <BigNumberText fz={labelFontSize}>
                        {bigNumberLabel || defaultLabel}
                    </BigNumberText>
                </Flex>
            ) : null}

            {showComparison ? (
                <Flex
                    justify="center"
                    display="inline-flex"
                    wrap="wrap"
                    style={{ flexShrink: 1 }}
                    mt={labelFontSize / 2}
                >
                    <Tooltip withinPortal label={comparisonTooltip}>
                        <Group spacing="two" mr={comparisonLabel ? 'xs' : '0'}>
                            <BigNumberText
                                span
                                fz={comparisonFontSize}
                                c={comparisonValueColor}
                            >
                                {comparisonValue}
                            </BigNumberText>

                            {comparisonDiff === ComparisonDiffTypes.POSITIVE ? (
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    display="inline"
                                    color={comparisonValueColor}
                                    size={comparisonFontSize}
                                />
                            ) : comparisonDiff ===
                              ComparisonDiffTypes.NEGATIVE ? (
                                <MantineIcon
                                    icon={IconArrowDownRight}
                                    display="inline"
                                    color={comparisonValueColor}
                                    size={comparisonFontSize}
                                />
                            ) : null}
                        </Group>
                    </Tooltip>

                    {comparisonLabel ? (
                        <BigNumberText span fz={comparisonFontSize} c="gray.6">
                            {comparisonLabel}
                        </BigNumberText>
                    ) : null}
                </Flex>
            ) : null}
        </Center>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
