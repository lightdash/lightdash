import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconGripVertical,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';
import { ChartTypeSelect } from './ChartTypeSelect';

type Props = {
    isCollapsable?: boolean;
    seriesLabel: string;
    layout?: CartesianChartLayout;
    series: Series;
    isSingle?: boolean;
    isGrouped?: boolean;
    updateSingleSeries: (updatedSeries: Series) => void;
    isOpen?: boolean;
    toggleIsOpen?: () => void;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
};

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    updateSingleSeries,
    isGrouped,
    isSingle,
    isOpen,
    toggleIsOpen,
    dragHandleProps,
}) => {
    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;

    return (
        <Stack spacing="two">
            <Group noWrap spacing="xs" position={isGrouped ? 'apart' : 'left'}>
                <Group spacing="two">
                    {isGrouped && (
                        <Box
                            {...dragHandleProps}
                            sx={{
                                opacity: 0.6,
                                '&:hover': { opacity: 1 },
                            }}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </Box>
                    )}

                    {!isSingle && (
                        <TextInput
                            size="xs"
                            disabled={series.hidden}
                            defaultValue={series.name || seriesLabel}
                            onBlur={(e) => {
                                updateSingleSeries({
                                    ...series,
                                    name: e.currentTarget.value,
                                });
                            }}
                        />
                    )}
                </Group>

                <Group spacing="one">
                    {isGrouped && (
                        <ActionIcon
                            onClick={() => {
                                updateSingleSeries({
                                    ...series,
                                    hidden: !series.hidden,
                                });
                            }}
                        >
                            <MantineIcon
                                icon={series.hidden ? IconEye : IconEyeOff}
                            />
                        </ActionIcon>
                    )}
                    {isCollapsable && (
                        <ActionIcon onClick={toggleIsOpen}>
                            <MantineIcon
                                color="gray.7"
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
            <Collapse in={!isCollapsable || isOpen || false}>
                <Stack ml={isGrouped ? 'lg' : 'none'} spacing="xs">
                    <Group spacing="xs" noWrap>
                        <ChartTypeSelect
                            showLabel={!isGrouped}
                            chartValue={type}
                            showMixed={false}
                            onChange={(value) => {
                                const newType =
                                    value === CartesianSeriesType.AREA
                                        ? CartesianSeriesType.LINE
                                        : value;
                                updateSingleSeries({
                                    ...series,
                                    type: newType as CartesianSeriesType,
                                    areaStyle:
                                        value === CartesianSeriesType.AREA
                                            ? {}
                                            : undefined,
                                });
                            }}
                        />

                        <Select
                            label={!isGrouped && 'Axis'}
                            size="xs"
                            value={String(series.yAxisIndex)}
                            data={[
                                {
                                    value: '0',
                                    label: layout?.flipAxes ? 'Bottom' : 'Left',
                                },
                                {
                                    value: '1',
                                    label: layout?.flipAxes ? 'Top' : 'Right',
                                },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    yAxisIndex: parseInt(value || '0', 10),
                                });
                            }}
                        />
                        <Select
                            label={!isGrouped && 'Value labels'}
                            size="xs"
                            value={series.label?.position || 'hidden'}
                            data={[
                                { value: 'hidden', label: 'Hidden' },
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                                { value: 'inside', label: 'Inside' },
                            ]}
                            onChange={(value) => {
                                updateSingleSeries({
                                    ...series,
                                    label:
                                        value === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: value as any,
                                              },
                                });
                            }}
                        />
                    </Group>
                    {(type === CartesianSeriesType.LINE ||
                        type === CartesianSeriesType.AREA) && (
                        <Group spacing="xs">
                            <Checkbox
                                size="xs"
                                checked={series.showSymbol ?? true}
                                label="Show symbol"
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        showSymbol: !(
                                            series.showSymbol ?? true
                                        ),
                                    });
                                }}
                            />
                            <Checkbox
                                size="xs"
                                checked={series.smooth}
                                label="Smooth"
                                onChange={() => {
                                    updateSingleSeries({
                                        ...series,
                                        smooth: !series.smooth,
                                    });
                                }}
                            />
                        </Group>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
};

SingleSeriesConfiguration.defaultProps = {
    isGrouped: false,
};

export default SingleSeriesConfiguration;
