import { Box, Group, Text } from '@mantine-8/core';
import { type FC } from 'react';
import GradientBar from '../common/GradientBar';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

type MapLegendProps = {
    colors: string[];
    formattedMin: string;
    formattedMax: string;
    label?: string;
    opacity?: number;
};

const MapLegend: FC<MapLegendProps> = ({
    colors,
    formattedMin,
    formattedMax,
    label,
    opacity,
}) => {
    return (
        <Box className={classes.legend}>
            {label && (
                <Text fz="xs" fw={500} c="ldGray.7" mb={4}>
                    {label}
                </Text>
            )}
            <GradientBar
                colors={colors}
                height={12}
                borderRadius={4}
                opacity={opacity}
            />
            <Group justify="space-between">
                <Text span fz="xs" c="ldGray.6">
                    {formattedMin}
                </Text>
                <Text span fz="xs" c="ldGray.6">
                    {formattedMax}
                </Text>
            </Group>
        </Box>
    );
};

export default MapLegend;
