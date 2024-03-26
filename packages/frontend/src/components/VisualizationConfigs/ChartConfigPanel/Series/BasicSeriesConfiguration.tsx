import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    getItemLabelWithoutTableName,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../../ColorSelector';
import { ConfigGroup } from '../common/ConfigGroup';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation | CustomDimension;
    updateSingleSeries: (series: Series) => void;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
};

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    isSingle,
    layout,
    series,
    item,
    updateSingleSeries,
    dragHandleProps,
}) => {
    const { colorPalette, getSeriesColor } = useVisualizationContext();

    return (
        <ConfigGroup>
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
                <Group spacing="sm">
                    <ConfigGroup.Label>
                        {getItemLabelWithoutTableName(item)}
                    </ConfigGroup.Label>
                    <ColorSelector
                        color={getSeriesColor(series)}
                        swatches={colorPalette}
                        onColorChange={(color) => {
                            updateSingleSeries({
                                ...series,
                                color,
                            });
                        }}
                    />
                </Group>
            </Group>
            <SingleSeriesConfiguration
                layout={layout}
                series={series}
                isSingle={isSingle}
                seriesLabel={getItemLabelWithoutTableName(item)}
                updateSingleSeries={updateSingleSeries}
            />
        </ConfigGroup>
    );
};

export default BasicSeriesConfiguration;
