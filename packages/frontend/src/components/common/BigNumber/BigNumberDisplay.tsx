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
import {
    forwardRef,
    type FC,
    type HTMLAttributes,
    type ReactNode,
} from 'react';
import { useResizeObserver } from '../../../hooks/useResizeObserver';
import MantineIcon from '../MantineIcon';
import styles from './BigNumberDisplay.module.css';
import {
    calculateBigNumberFontSizes,
    COMPARISON_LABEL_MIN_HEIGHT,
    getTrendPillClass,
    VALUE_SIZE_MIN,
} from './sizing';

const LABEL_TOOLTIP_MIN_LENGTH = 40;
const COMPARISON_LABEL_TOOLTIP_MIN_LENGTH = 30;

const BigNumberText: FC<
    TextProps & { children: ReactNode; isHeading?: boolean }
> = forwardRef<
    HTMLDivElement,
    TextProps & { children: ReactNode; isHeading?: boolean }
>(({ children, isHeading = false, ...textProps }, ref) => (
    <Text
        ref={ref}
        ta="center"
        fw={500}
        {...textProps}
        style={{
            transition: 'font-size 0.1s ease-in-out',
            ...(isHeading && {
                letterSpacing: '-0.02em',
                lineHeight: 0.9,
            }),
            ...(typeof textProps.style === 'object' &&
            !Array.isArray(textProps.style)
                ? textProps.style
                : {}),
        }}
    >
        {children}
    </Text>
));

export type BigNumberComparison = {
    formattedValue: string;
    direction: ComparisonDiffTypes;
    label: string | undefined;
    tooltip: string;
};

export type BigNumberDisplayProps = {
    value: string;
    label: string;
    showLabel: boolean;
    comparison: BigNumberComparison | undefined;
    flipColors: boolean;
    /** Raw CSS colour from conditional formatting, if any. */
    valueColor?: string;
    /** Wraps the value so callers can attach a context menu. */
    renderValue?: (value: ReactNode) => ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Renders a big number, its label and its comparison pill, scaling every font
 * size to the container. Shared by the explorer and SQL Runner big numbers so
 * they stay visually identical.
 */
export const BigNumberDisplay: FC<BigNumberDisplayProps> = ({
    value,
    label,
    showLabel,
    comparison,
    flipColors,
    valueColor,
    renderValue,
    ...wrapperProps
}) => {
    const [setRef, observerElementSize] = useResizeObserver();

    const {
        valueFontSize,
        labelFontSize,
        comparisonFontSize,
        comparisonPillFontSize,
        spacingMultiplier: scaledSpacingMultiplier,
        availableHeight,
        labelLineClamp,
    } = calculateBigNumberFontSizes(observerElementSize);

    // At the smallest value size the line heights already provide the spacing.
    const spacingMultiplier =
        valueFontSize === VALUE_SIZE_MIN && showLabel && !!comparison
            ? 0
            : scaledSpacingMultiplier;

    const valueNode = (
        <BigNumberText
            fz={valueFontSize}
            fw={600}
            isHeading
            data-testid="big-number-value"
            style={{
                '--big-number-color': valueColor,
                ...(renderValue ? { cursor: 'pointer' } : {}),
            }}
            className={styles.bigNumberText}
        >
            {value}
        </BigNumberText>
    );

    return (
        <Center
            w="100%"
            h="100%"
            component={Stack}
            dir="column"
            justify="center"
            align="center"
            gap={0}
            ref={setRef}
            {...wrapperProps}
        >
            <Flex style={{ flexShrink: 1 }} justify="center" align="center">
                {renderValue ? renderValue(valueNode) : valueNode}
            </Flex>

            {showLabel && (
                <Flex
                    style={{ flexShrink: 1 }}
                    justify="center"
                    align="center"
                    mt={valueFontSize * 0.15 * spacingMultiplier}
                >
                    <Tooltip
                        withinPortal
                        label={label}
                        disabled={
                            !label || label.length < LABEL_TOOLTIP_MIN_LENGTH
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
                            {label}
                        </Text>
                    </Tooltip>
                </Flex>
            )}

            {comparison && (
                <Flex
                    justify="center"
                    align="center"
                    display="inline-flex"
                    wrap="wrap"
                    style={{ flexShrink: 1 }}
                    mt={
                        showLabel
                            ? labelFontSize * 0.85 * spacingMultiplier
                            : valueFontSize * 0.5 * spacingMultiplier
                    }
                    gap="xs"
                >
                    <Tooltip withinPortal label={comparison.tooltip}>
                        <Group
                            className={getTrendPillClass(
                                comparison.direction,
                                flipColors,
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
                                {comparison.formattedValue}
                            </Text>

                            {comparison.direction ===
                            ComparisonDiffTypes.POSITIVE ? (
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    display="inline"
                                    size={comparisonPillFontSize + 1}
                                    stroke={2}
                                />
                            ) : comparison.direction ===
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

                    {comparison.label &&
                        availableHeight > COMPARISON_LABEL_MIN_HEIGHT && (
                            <Tooltip
                                withinPortal
                                label={comparison.label}
                                disabled={
                                    comparison.label.length <
                                    COMPARISON_LABEL_TOOLTIP_MIN_LENGTH
                                }
                            >
                                <BigNumberText
                                    span
                                    fz={comparisonFontSize}
                                    c="ldGray.6"
                                    fw={400}
                                    lineClamp={1}
                                >
                                    {comparison.label}
                                </BigNumberText>
                            </Tooltip>
                        )}
                </Flex>
            )}
        </Center>
    );
};
