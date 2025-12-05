import { ComparisonDiffTypes } from '@lightdash/common';
import {
    Center,
    Flex,
    Group,
    Stack,
    Text,
    Tooltip,
    type TextProps,
} from '@mantine-8/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import clamp from 'lodash/clamp';
import {
    forwardRef,
    useMemo,
    type FC,
    type HTMLAttributes,
    type ReactNode,
} from 'react';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { DEFAULT_ROW_HEIGHT } from '../DashboardTabs/gridUtils';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { EmptyChart, LoadingChart } from '../SimpleChart';
import MantineIcon from '../common/MantineIcon';
import BigNumberContextMenu from './BigNumberContextMenu';
import styles from './SimpleStatistic.module.css';

interface SimpleStatisticsProps extends HTMLAttributes<HTMLDivElement> {
    minimal?: boolean;
    isTitleHidden?: boolean;
    isDashboard?: boolean;
}

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const BOX_MIN_HEIGHT = DEFAULT_ROW_HEIGHT;
const BOX_MAX_HEIGHT = 1000;

const VALUE_SIZE_MIN = 22;
const VALUE_SIZE_MAX = 128;

const LABEL_SIZE_MIN = 12;
const LABEL_SIZE_MAX = 48;

const COMPARISON_VALUE_SIZE_MIN = 12;
const COMPARISON_VALUE_SIZE_MAX = 22;

const COMPARISON_PILL_SIZE_MIN = 10;
const COMPARISON_PILL_SIZE_MAX = 16;

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

const BigNumberText: FC<
    TextProps & { children: ReactNode; isHeading?: boolean }
> = forwardRef<
    HTMLDivElement,
    TextProps & { children: ReactNode; isHeading?: boolean }
>(({ children, isHeading = false, ...textProps }, ref) => {
    return (
        <Text
            ref={ref}
            c="foreground"
            ta="center"
            fw={500}
            {...textProps}
            style={{
                transition: 'font-size 0.1s ease-in-out',
                ...(isHeading && {
                    letterSpacing: '-0.02em',
                    lineHeight: 0.9,
                }),
                ...textProps.style,
            }}
        >
            {children}
        </Text>
    );
});

const getTrendPillClass = (
    comparisonDiff: ComparisonDiffTypes,
    flipColors?: boolean,
): string => {
    const variantClass = (() => {
        switch (comparisonDiff) {
            case ComparisonDiffTypes.POSITIVE:
                return flipColors ? styles.trendPillDown : styles.trendPillUp;
            case ComparisonDiffTypes.NEGATIVE:
                return flipColors ? styles.trendPillUp : styles.trendPillDown;
            case ComparisonDiffTypes.NAN:
            case ComparisonDiffTypes.UNDEFINED:
            case ComparisonDiffTypes.NONE:
            default:
                return styles.trendPillNeutral;
        }
    })();

    return `${styles.trendPill} ${variantClass}`;
};

const SimpleStatistic: FC<SimpleStatisticsProps> = ({
    minimal = false,
    ...wrapperProps
}) => {
    const ability = useAbilityContext();
    const { embedToken } = useEmbed();

    const { resultsData, isLoading, visualizationConfig } =
        useVisualizationContext();

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

    const [setRef, observerElementSize] = useResizeObserver();

    const {
        valueFontSize,
        labelFontSize,
        comparisonFontSize,
        comparisonPillFontSize,
        spacingMultiplier: _spacingMultiplier,
        availableHeight,
        labelLineClamp,
    } = useMemo(() => {
        const boundWidth = clamp(
            observerElementSize?.width || 0,
            BOX_MIN_WIDTH,
            BOX_MAX_WIDTH,
        );

        const availableHeightForFontSizeCalculation =
            observerElementSize?.height ?? 0;

        const boundHeight = clamp(
            availableHeightForFontSizeCalculation,
            BOX_MIN_HEIGHT,
            BOX_MAX_HEIGHT,
        );
        const heightScale =
            (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

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

        const heightScalePill =
            (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

        const pillScalingFactor = Math.max(0, Math.min(1, heightScalePill));

        const comparisonPillSize = Math.floor(
            COMPARISON_PILL_SIZE_MIN +
                (COMPARISON_PILL_SIZE_MAX - COMPARISON_PILL_SIZE_MIN) *
                    pillScalingFactor,
        );

        const spacingMultiplierForFontSizeCalculation = Math.max(
            0.5,
            heightScale,
        );

        // Use 1 line clamp for small tiles, 2 for larger ones
        const labelLineClampForFontSizeCalculation =
            availableHeightForFontSizeCalculation < 120 ? 1 : 2;

        return {
            valueFontSize: valueSize,
            labelFontSize: labelSize,
            comparisonFontSize: comparisonValueSize,
            comparisonPillFontSize: comparisonPillSize,
            spacingMultiplier: spacingMultiplierForFontSizeCalculation,
            availableHeight: availableHeightForFontSizeCalculation,
            labelLineClamp: labelLineClampForFontSizeCalculation,
        };
    }, [observerElementSize]);

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

    // If we are at the minimun value size font without much space, don't add spacing. The line height will account for the spacing needed.
    const spacingMultiplier =
        valueFontSize === VALUE_SIZE_MIN && showBigNumberLabel && showComparison
            ? 0
            : _spacingMultiplier;
    const validData = bigNumber && resultsData?.rows.length;

    if (isLoading) return <LoadingChart />;

    const shouldHideContextMenu =
        (minimal && !embedToken) ||
        (embedToken && ability.cannot('view', 'UnderlyingData'));

    return validData ? (
        <Center
            w="100%"
            h="100%"
            component={Stack}
            dir="column"
            justify="center"
            align="center"
            gap={0}
            ref={(elem) => {
                setRef(elem);
            }}
            {...wrapperProps}
            styles={{
                root: {
                    // TODO: remove this once Inter is the default font
                    fontFamily:
                        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                },
            }}
        >
            <Flex style={{ flexShrink: 1 }} justify="center" align="center">
                {shouldHideContextMenu ? (
                    <BigNumberText fz={valueFontSize} fw={600} isHeading>
                        {bigNumber}
                    </BigNumberText>
                ) : (
                    <BigNumberContextMenu>
                        <BigNumberText
                            fz={valueFontSize}
                            fw={600}
                            isHeading
                            style={{
                                cursor: 'pointer',
                            }}
                        >
                            {bigNumber}
                        </BigNumberText>
                    </BigNumberContextMenu>
                )}
            </Flex>

            {showBigNumberLabel ? (
                <Flex
                    style={{ flexShrink: 1 }}
                    justify="center"
                    align="center"
                    mt={valueFontSize * 0.15 * spacingMultiplier}
                >
                    <Tooltip
                        withinPortal
                        label={bigNumberLabel || defaultLabel}
                        disabled={
                            !(bigNumberLabel || defaultLabel) ||
                            (bigNumberLabel || defaultLabel || '').length < 40
                        }
                    >
                        <Text
                            fz={labelFontSize}
                            c="ldGray.6"
                            fw={500}
                            ta="center"
                            lineClamp={labelLineClamp}
                            style={{
                                transition: 'font-size 0.1s ease-in-out',
                                lineHeight: '120%',
                            }}
                        >
                            {bigNumberLabel || defaultLabel}
                        </Text>
                    </Tooltip>
                </Flex>
            ) : null}

            {showComparison ? (
                <Flex
                    justify="center"
                    align="center"
                    display="inline-flex"
                    wrap="wrap"
                    style={{ flexShrink: 1 }}
                    mt={
                        showBigNumberLabel
                            ? labelFontSize * 0.85 * spacingMultiplier
                            : valueFontSize * 0.5 * spacingMultiplier
                    }
                    gap="xs"
                >
                    <Tooltip withinPortal label={comparisonTooltip}>
                        <Group
                            className={getTrendPillClass(
                                comparisonDiff,
                                visualizationConfig.chartConfig.flipColors,
                            )}
                            style={{
                                padding: `${Math.max(
                                    1,
                                    comparisonPillFontSize * 0.15,
                                )}px ${Math.max(
                                    4,
                                    comparisonPillFontSize * 0.4,
                                )}px`,
                            }}
                        >
                            <Text
                                fz={comparisonPillFontSize}
                                fw={600}
                                {...(spacingMultiplier === 0 && { lh: 0 })}
                            >
                                {comparisonValue}
                            </Text>

                            {comparisonDiff === ComparisonDiffTypes.POSITIVE ? (
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    display="inline"
                                    size={comparisonPillFontSize + 1}
                                    stroke={2}
                                />
                            ) : comparisonDiff ===
                              ComparisonDiffTypes.NEGATIVE ? (
                                <MantineIcon
                                    icon={IconArrowDownRight}
                                    display="inline"
                                    size={comparisonPillFontSize + 1}
                                    stroke={2}
                                />
                            ) : null}
                        </Group>
                    </Tooltip>

                    {comparisonLabel && availableHeight > 70 ? (
                        <Tooltip
                            withinPortal
                            label={comparisonLabel}
                            disabled={comparisonLabel.length < 30}
                        >
                            <BigNumberText
                                span
                                fz={comparisonFontSize}
                                c="ldGray.6"
                                fw={400}
                                lineClamp={1}
                            >
                                {comparisonLabel}
                            </BigNumberText>
                        </Tooltip>
                    ) : null}
                </Flex>
            ) : null}
        </Center>
    ) : (
        <EmptyChart />
    );
};

export default SimpleStatistic;
