import { Box, Text } from '@mantine-8/core';

type TableCellBarProps = {
    value: number;
    formatted: string;
    // Widest formatted label in the column; reserves a constant label gutter
    // so the bar track is the same width on every row.
    maxLabel: string;
    min: number;
    max: number;
    color?: string;
};

export const TableCellBar = ({
    value,
    formatted,
    maxLabel,
    min,
    max,
    color = '#5470c6',
}: TableCellBarProps) => {
    // Calculate bar width percentage
    const range = max - min;
    const percentage =
        range > 0
            ? Math.max(0, Math.min(100, ((value - min) / range) * 100))
            : 0;

    // Only show bar for positive numbers
    const showBar = value > 0;

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
            {showBar ? (
                <Box
                    h="20px"
                    w={`${percentage}%`}
                    bg={color}
                    maw="100%"
                    // Always show visible bar for positive values
                    miw="2px"
                    style={{
                        borderRadius: '2px',
                    }}
                />
            ) : (
                <Box />
            )}
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
