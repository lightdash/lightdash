import { ActionIcon, Box, Group, Stack, Text } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPlus, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import GradientBar from '../../common/GradientBar';
import ColorSelector from '../ColorSelector';

const MAX_COLOR_STOPS = 5;

type ColorItemProps = {
    color: string;
    label: string;
    swatches: string[];
    canRemove: boolean;
    onColorChange: (color: string) => void;
    onRemove: () => void;
};

const ColorItem: FC<ColorItemProps> = ({
    color,
    label,
    swatches,
    canRemove,
    onColorChange,
    onRemove,
}) => {
    const { hovered, ref } = useHover();

    return (
        <Stack gap="xs" align="center">
            <Text size="xs" fw={500} h={16}>
                {label || ' '}
            </Text>
            <Box ref={ref} pos="relative">
                <ColorSelector
                    color={color}
                    swatches={swatches}
                    onColorChange={onColorChange}
                />
                {canRemove && hovered && (
                    <ActionIcon
                        size={14}
                        variant="filled"
                        color="gray"
                        radius="xl"
                        pos="absolute"
                        top={-4}
                        right={-4}
                        onClick={onRemove}
                        aria-label="Remove colour"
                        style={{ zIndex: 10 }}
                    >
                        <IconX size={8} />
                    </ActionIcon>
                )}
            </Box>
        </Stack>
    );
};

type Props = {
    colors: string[];
    swatches: string[];
    onColorChange: (index: number, color: string) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
};

/**
 * Low-to-high colour stops with a live preview: middle stops can be removed
 * and added up to five.
 */
const GradientColorStops: FC<Props> = ({
    colors,
    swatches,
    onColorChange,
    onAdd,
    onRemove,
}) => (
    <>
        <Group gap="xs" align="flex-start">
            {colors.map((color, index) => {
                const isFirst = index === 0;
                const isLast = index === colors.length - 1;
                const label = isFirst ? 'Low' : isLast ? 'High' : '';
                // Can only remove middle colors (not first or last)
                const canRemove = !isFirst && !isLast && colors.length > 2;

                return (
                    <ColorItem
                        key={index}
                        color={color}
                        label={label}
                        swatches={swatches}
                        canRemove={canRemove}
                        onColorChange={(newColor) =>
                            onColorChange(index, newColor)
                        }
                        onRemove={() => onRemove(index)}
                    />
                );
            })}
            {colors.length < MAX_COLOR_STOPS && (
                <Stack gap={4} align="center">
                    <Text size="xs" fw={500} h={16}>
                        {' '}
                    </Text>
                    <ActionIcon
                        size="sm"
                        variant="light"
                        onClick={onAdd}
                        aria-label="Add colour"
                    >
                        <IconPlus size={14} />
                    </ActionIcon>
                </Stack>
            )}
        </Group>
        <GradientBar colors={colors} />
    </>
);

export default GradientColorStops;
