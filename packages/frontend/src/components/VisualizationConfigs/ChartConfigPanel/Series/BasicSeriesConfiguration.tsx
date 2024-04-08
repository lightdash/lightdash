import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    getItemLabelWithoutTableName,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type SeriesMetadata,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../../ColorSelector';
import { Config } from '../../common/Config';
import { EditableText } from '../../common/EditableText';
import { GrabIcon } from '../../common/GrabIcon';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

type BasicSeriesConfigurationProps = {
    isSingle: boolean;
    layout?: CartesianChartLayout;
    series: Series;
    item: Field | TableCalculation | CustomDimension;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    metadata?: Record<string, SeriesMetadata>;
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries' | 'updateMetadata'
>;

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    isSingle,
    layout,
    metadata,
    series,
    item,
    getSingleSeries,
    updateSingleSeries,
    dragHandleProps,
    updateMetadata,
}) => {
    const { colorPalette, getSeriesColor } = useVisualizationContext();
    const [value, setValue] = useDebouncedState(
        getSingleSeries(series)?.name || getItemLabelWithoutTableName(item),
        500,
    );

    return (
        <Config>
            <Config.Section>
                <Group noWrap spacing="two">
                    <GrabIcon dragHandleProps={dragHandleProps} />

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
                        <Config.Heading>
                            {getItemLabelWithoutTableName(item)}
                        </Config.Heading>
                    ) : (
                        <Box
                            style={{
                                flexGrow: 1,
                            }}
                        >
                            <EditableText
                                sx={{ flexGrow: 1 }}
                                fw={600}
                                size="sm"
                                lighter
                                defaultValue={value}
                                placeholder={getItemLabelWithoutTableName(item)}
                                onChange={(event) => {
                                    setValue(event.currentTarget.value);
                                    updateSingleSeries({
                                        ...series,
                                        name: event.currentTarget.value,
                                    });
                                }}
                            />
                        </Box>
                    )}
                </Group>
                <SingleSeriesConfiguration
                    layout={layout}
                    series={series}
                    isSingle={isSingle}
                    seriesLabel={getItemLabelWithoutTableName(item)}
                    updateSingleSeries={updateSingleSeries}
                    getSingleSeries={getSingleSeries}
                    metadata={metadata}
                    updateMetadata={updateMetadata}
                />
            </Config.Section>
        </Config>
    );
};

export default BasicSeriesConfiguration;
