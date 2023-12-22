import {
    CartesianChartLayout,
    CustomDimension,
    Field,
    getItemLabelWithoutTableName,
    getSeriesId,
    Series,
    TableCalculation,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import React, { FC } from 'react';
import { DraggableProvidedDragHandleProps } from 'react-beautiful-dnd';
import MantineIcon from '../../../common/MantineIcon';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation | CustomDimension;
    getSeriesColor: (key: string) => string | undefined;
    updateSingleSeries: (series: Series) => void;
    dragHandleProps?: DraggableProvidedDragHandleProps;
};

const BasicSeriesConfiguration: FC<
    React.PropsWithChildren<BasicSeriesConfigurationProps>
> = ({
    isSingle,
    layout,
    series,
    item,
    getSeriesColor,
    updateSingleSeries,
    dragHandleProps,
}) => {
    return (
        <Stack spacing="xs">
            <Group noWrap spacing="two">
                <Box
                    {...dragHandleProps}
                    sx={{
                        opacity: 0.6,
                        '&:hover': { opacity: 1 },
                    }}
                >
                    <MantineIcon icon={IconGripVertical} />
                </Box>
                <Text fw={500}> {getItemLabelWithoutTableName(item)} </Text>
            </Group>
            <SingleSeriesConfiguration
                layout={layout}
                series={series}
                isSingle={isSingle}
                seriesLabel={getItemLabelWithoutTableName(item)}
                fallbackColor={getSeriesColor(getSeriesId(series))}
                updateSingleSeries={updateSingleSeries}
            />
        </Stack>
    );
};

export default BasicSeriesConfiguration;
