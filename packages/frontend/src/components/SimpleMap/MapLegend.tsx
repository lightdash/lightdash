import { Box, Group, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import GradientBar from '../common/GradientBar';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

type BubbleSizeInfo = {
    minSize: number;
    maxSize: number;
    formattedMin: string;
    formattedMax: string;
    label?: string;
};

type ColorInfo = {
    colors: string[];
    formattedMin: string;
    formattedMax: string;
    label?: string;
    opacity?: number;
};

type MapLegendProps = {
    color?: ColorInfo;
    bubbleSize?: BubbleSizeInfo;
};

const MapLegend: FC<MapLegendProps> = ({ color, bubbleSize }) => {
    return (
        <Box className={classes.legend}>
            <Stack gap="sm">
                {/* Color legend */}
                {color && (
                    <Box>
                        {color.label && (
                            <Text fz="xs" fw={500} c="ldGray.7" mb={4}>
                                {color.label}
                            </Text>
                        )}
                        <GradientBar
                            colors={color.colors}
                            height={12}
                            borderRadius={4}
                            opacity={color.opacity}
                        />
                        <Group justify="space-between">
                            <Text span fz="xs" c="ldGray.6">
                                {color.formattedMin}
                            </Text>
                            <Text span fz="xs" c="ldGray.6">
                                {color.formattedMax}
                            </Text>
                        </Group>
                    </Box>
                )}

                {/* Bubble size legend */}
                {bubbleSize && (
                    <Box>
                        {bubbleSize.label && (
                            <Text fz="xs" fw={500} c="ldGray.7" mb={4}>
                                {bubbleSize.label}
                            </Text>
                        )}
                        <Group
                            gap="md"
                            justify="space-between"
                            align="flex-end"
                        >
                            <Stack gap={2} align="center">
                                <Box
                                    w={bubbleSize.minSize * 2}
                                    h={bubbleSize.minSize * 2}
                                    style={{
                                        borderRadius: '50%',
                                        border: '1.5px solid var(--mantine-color-ldGray-5)',
                                    }}
                                />
                                <Text fz="xs" c="ldGray.6">
                                    {bubbleSize.formattedMin}
                                </Text>
                            </Stack>
                            <Stack gap={2} align="center">
                                <Box
                                    w={bubbleSize.maxSize * 2}
                                    h={bubbleSize.maxSize * 2}
                                    style={{
                                        borderRadius: '50%',
                                        border: '1.5px solid var(--mantine-color-ldGray-5)',
                                    }}
                                />
                                <Text fz="xs" c="ldGray.6">
                                    {bubbleSize.formattedMax}
                                </Text>
                            </Stack>
                        </Group>
                    </Box>
                )}
            </Stack>
        </Box>
    );
};

export default MapLegend;
