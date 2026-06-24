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
    // Calculate bar width percentage relative to the full cell width
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
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '100%',
                minHeight: '20px',
            }}
        >
            {showBar && (
                <Box
                    h="20px"
                    w={`${percentage}%`}
                    bg={color}
                    // Always show a visible bar for positive values
                    miw="2px"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        borderRadius: '2px',
                    }}
                />
            )}
            <Text
                span
                style={{ whiteSpace: 'nowrap', position: 'relative' }}
                fz="xs"
            >
                {formatted}
            </Text>
        </Box>
    );
};
