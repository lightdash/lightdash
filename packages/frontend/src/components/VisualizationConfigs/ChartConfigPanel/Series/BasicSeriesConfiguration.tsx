import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    getItemLabelWithoutTableName,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    ColorPicker as MantineColorPicker,
    Popover,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { IconHash, IconPalette } from '@tabler/icons-react';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import MantineIcon from '../../../common/MantineIcon';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
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
    isDragDisabled?: boolean;
    showColorPickerIcon?: boolean;
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
    isDragDisabled,
    showColorPickerIcon,
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
                    <GrabIcon
                        dragHandleProps={dragHandleProps}
                        disabled={isDragDisabled}
                        disabledTooltip="Series order is automatically determined by the sort applied to the grouped dimension"
                    />

                    {showColorPickerIcon ? (
                        <Popover withinPortal shadow="md" withArrow>
                            <Popover.Target>
                                <Tooltip
                                    label="Color all categories"
                                    withinPortal
                                >
                                    <ActionIcon size="sm">
                                        <MantineIcon
                                            icon={IconPalette}
                                            color="gray.6"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Popover.Target>
                            <Popover.Dropdown p="xs">
                                <Stack spacing="xs">
                                    <MantineColorPicker
                                        size="sm"
                                        format="hex"
                                        swatches={colorPalette}
                                        swatchesPerRow={8}
                                        value={colorPalette[0]}
                                        onChange={(color) => {
                                            updateSingleSeries({
                                                ...series,
                                                color,
                                            });
                                        }}
                                    />
                                    <TextInput
                                        size="xs"
                                        icon={<MantineIcon icon={IconHash} />}
                                        placeholder="Type a custom HEX color"
                                        onChange={(event) => {
                                            const val =
                                                event.currentTarget.value;
                                            updateSingleSeries({
                                                ...series,
                                                color:
                                                    val === ''
                                                        ? val
                                                        : `#${val}`,
                                            });
                                        }}
                                    />
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    ) : (
                        <ColorSelector
                            color={getSeriesColor(series)}
                            swatches={colorPalette}
                            withAlpha
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    color,
                                });
                            }}
                        />
                    )}
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
                />
            </Config.Section>
        </Config>
    );
};

export default BasicSeriesConfiguration;
