import { Box, Text } from '@mantine-8/core';
import { type ReactNode } from 'react';

type TableCellBarProps = {
    value: number;
    formatted: string;
    // Widest formatted label in the column; reserves a constant label gutter
    // so the bar track is the same width on every row.
    maxLabel: string;
    min: number;
    max: number;
    color?: string;
    negativeColor?: string;
};

const BAR_HEIGHT = '20px';
const MIN_BAR_WIDTH = '2px';
const DEFAULT_BAR_COLOR = '#5470c6';

const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, n));

export const TableCellBar = ({
    value,
    formatted,
    maxLabel,
    min,
    max,
    color = DEFAULT_BAR_COLOR,
    negativeColor,
}: TableCellBarProps) => {
    // Scale always includes zero (Excel-style automatic axis) so all-negative
    // columns don't clamp distinct values to identical full-width bars.
    const range = Math.max(max, 0) - min;
    const negativeBarColor = negativeColor ?? color;

    // Diverging mode only kicks in when the column contains negative values.
    // Positive-only columns keep the original left-anchored bar unchanged.
    const isDiverging = min < 0 && range > 0;

    let bar: ReactNode;

    if (!isDiverging) {
        // Positive-only (or zero range): left-anchored fill from the far left.
        const percentage =
            range > 0 ? clamp(((value - min) / range) * 100, 0, 100) : 0;

        bar =
            value > 0 ? (
                <Box
                    h={BAR_HEIGHT}
                    w={`${percentage}%`}
                    bg={color}
                    maw="100%"
                    // Always show a visible bar for positive values
                    miw={MIN_BAR_WIDTH}
                    style={{ borderRadius: '2px' }}
                />
            ) : (
                <Box />
            );
    } else {
        // Diverging mode: the zero baseline is placed proportionally along the
        // track (Excel-style "automatic axis"). Positive bars grow right of
        // zero, negative bars grow left. When every value is negative
        // (max <= 0) the zero line clamps to the right edge so all bars grow
        // leftward from it.
        const zeroPercent = clamp(((0 - min) / range) * 100, 0, 100);
        const positiveWidth =
            value > 0 ? clamp((value / range) * 100, 0, 100 - zeroPercent) : 0;
        const negativeWidth =
            value < 0 ? clamp((-value / range) * 100, 0, zeroPercent) : 0;
        const showZeroLine = zeroPercent > 0 && zeroPercent < 100;

        bar = (
            <Box
                h={BAR_HEIGHT}
                style={{
                    position: 'relative',
                    width: '100%',
                    // Clip min-width bars from spilling past the track edge
                    // when the baseline sits very close to it.
                    overflow: 'hidden',
                }}
            >
                {showZeroLine && (
                    <Box
                        aria-hidden
                        style={{
                            position: 'absolute',
                            left: `${zeroPercent}%`,
                            top: 0,
                            bottom: 0,
                            width: '1px',
                            transform: 'translateX(-0.5px)',
                            backgroundColor: 'var(--mantine-color-ldGray-3)',
                        }}
                    />
                )}
                {value > 0 && (
                    <Box
                        h={BAR_HEIGHT}
                        bg={color}
                        miw={MIN_BAR_WIDTH}
                        style={{
                            position: 'absolute',
                            top: 0,
                            // Left edge sits on the zero line, grows rightward.
                            left: `${zeroPercent}%`,
                            width: `${positiveWidth}%`,
                            borderRadius: '0 2px 2px 0',
                        }}
                    />
                )}
                {value < 0 && (
                    <Box
                        h={BAR_HEIGHT}
                        bg={negativeBarColor}
                        miw={MIN_BAR_WIDTH}
                        style={{
                            position: 'absolute',
                            top: 0,
                            // Right edge sits on the zero line, grows leftward.
                            right: `${100 - zeroPercent}%`,
                            width: `${negativeWidth}%`,
                            borderRadius: '2px 0 0 2px',
                        }}
                    />
                )}
            </Box>
        );
    }

    return (
        <Box
            style={{
                display: 'grid',
                // Bar track fills the space left after a constant label gutter
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '4px',
            }}
        >
            {bar}
            {/* Label gutter: when this row isn't the widest, an invisible
                sizer holds the column's widest label so the gutter width stays
                constant across every row. The visible label is right-aligned. */}
            <Box style={{ display: 'grid' }}>
                {maxLabel !== formatted && (
                    <Text
                        span
                        aria-hidden
                        fz="xs"
                        style={{
                            gridArea: '1 / 1',
                            visibility: 'hidden',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {maxLabel}
                    </Text>
                )}
                <Text
                    span
                    fz="xs"
                    style={{
                        gridArea: '1 / 1',
                        justifySelf: 'end',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {formatted}
                </Text>
            </Box>
        </Box>
    );
};
