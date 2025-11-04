import { Box, Text } from '@mantine-8/core';

type TableCellBarProps = {
    value: number;
    formatted: string;
    min: number;
    max: number;
    color?: string;
};

export const TableCellBar = ({
    value,
    formatted,
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
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '4px',
            }}
        >
            {showBar && (
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
            )}
            <Text span style={{ whiteSpace: 'nowrap' }} fz="xs">
                {formatted}
            </Text>
        </Box>
    );
};
