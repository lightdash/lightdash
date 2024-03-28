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
import { useDebouncedState } from '@mantine/hooks';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../../ColorSelector';
import { Config } from '../../common/Config';
import { EditableText } from '../common/EditableText';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation | CustomDimension;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries'
>;

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    isSingle,
    layout,
    series,
    item,
    getSingleSeries,
    updateSingleSeries,
    dragHandleProps,
}) => {
    const { colorPalette, getSeriesColor } = useVisualizationContext();
    const [value, setValue] = useDebouncedState(
        getSingleSeries(series)?.name || getItemLabelWithoutTableName(item),
        500,
    );

    return (
        <Config.Group>
            <Group noWrap spacing="two">
                <Box
                    {...dragHandleProps}
                    // TODO: add reusable component
                    sx={{
                        opacity: 0.6,
                        cursor: 'grab',
                        '&:hover': { opacity: 1 },
                    }}
                >
                    <MantineIcon icon={IconGripVertical} />
                </Box>

                <Group spacing="xs">
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
                    {isSingle ? (
                        <Config.Label>
                            {getItemLabelWithoutTableName(item)}
                        </Config.Label>
                    ) : (
                        <EditableText
                            size="sm"
                            fw={600}
                            defaultValue={value}
                            onChange={(event) => {
                                setValue(event.currentTarget.value);
                                updateSingleSeries({
                                    ...series,
                                    name: event.currentTarget.value,
                                });
                            }}
                        />
                    )}
                </Group>
            </Group>
            <SingleSeriesConfiguration
                layout={layout}
                series={series}
                isSingle={isSingle}
                seriesLabel={getItemLabelWithoutTableName(item)}
                updateSingleSeries={updateSingleSeries}
            />
        </Config.Group>
    );
};

export default BasicSeriesConfiguration;
