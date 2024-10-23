import {
    ECHARTS_DEFAULT_COLORS,
    type CartesianChartDisplay,
    type ChartKind,
    type Format,
    type PivotChartLayout,
} from '@lightdash/common';
import {
    CloseButton,
    Divider,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlignLeft, IconAlignRight, IconPencil } from '@tabler/icons-react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector,
} from '../../../features/sqlRunner/store/hooks';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { cartesianChartSelectors } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';
import { CartesianChartTypeConfig } from './CartesianChartTypeConfig';

export type ConfigurableSeries = {
    reference: PivotChartLayout['y'][number]['reference'];
    position?: NonNullable<CartesianChartDisplay['yAxis']>[number]['position'];
} & Pick<
    NonNullable<CartesianChartDisplay['series']>[number],
    'format' | 'label' | 'color' | 'type'
>;

type CartesianChartSeriesProps = {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
};

const SeriesItem = ({
    reference,
    label,
    color,
    colors,
    format,
    index,
    type,
    position,
    actions,
    selectedChartType,
}: Pick<CartesianChartSeriesProps, 'selectedChartType' | 'actions'> &
    ConfigurableSeries & { colors: string[]; index: number }) => {
    const dispatch = useVizDispatch();

    const form = useForm({
        initialValues: {
            label,
            type,
            color,
            format,
        },
    });
    return (
        <Group
            spacing="xxs"
            noWrap
            w="100%"
            px="xs"
            py="xxs"
            sx={(theme) => ({
                border: `1px solid ${theme.colors.gray[2]}`,
                borderRadius: theme.radius.md,
            })}
        >
            <ColorSelector
                radius="sm"
                color={color ?? colors[index]}
                onColorChange={(c) => {
                    dispatch(
                        actions.setSeriesColor({
                            reference,
                            index,
                            color: c,
                        }),
                    );
                }}
                swatches={colors}
            />
            <Popover
                key={reference}
                radius="md"
                position="bottom"
                shadow="md"
                offset={0}
                trapFocus
                onClose={() => {
                    // TODO: have a single action for all changes
                    if (form.values.label) {
                        dispatch(
                            actions.setSeriesLabel({
                                reference,
                                index,
                                label: form.values.label,
                            }),
                        );
                    }
                    if (form.values.type) {
                        dispatch(
                            actions.setSeriesChartType({
                                reference,
                                index,
                                type: form.values.type,
                            }),
                        );
                    }
                    if (form.values.format) {
                        dispatch(
                            actions.setSeriesFormat({
                                reference,
                                index,
                                format: form.values.format,
                            }),
                        );
                    }
                }}
            >
                <Popover.Target>
                    <UnstyledButton
                        h="100%"
                        sx={{
                            flexGrow: 1,
                        }}
                        color="gray"
                        c="dark.9"
                        fz={13}
                        fw={500}
                    >
                        <Text fw={500} fz={13}>
                            {label}
                        </Text>
                    </UnstyledButton>
                </Popover.Target>
                <Popover.Dropdown>
                    <Stack spacing="xs">
                        <Group position="apart">
                            <Group spacing="two">
                                <MantineIcon color="dark.1" icon={IconPencil} />
                                <Text fw={500} fz="sm" c="dark.9">
                                    Series {reference}
                                </Text>
                            </Group>
                            <CloseButton />
                        </Group>
                        <Divider c="gray.2" />
                        <Group position="apart">
                            <Text fz={13} fw={500} c="gray.6">
                                Label
                            </Text>
                            <TextInput
                                styles={(theme) => ({
                                    input: {
                                        border: `1px solid ${theme.colors.gray[2]}`,
                                        fontWeight: 500,
                                    },
                                })}
                                radius="md"
                                value={form.values.label}
                                onChange={(e) => {
                                    form.setFieldValue('label', e.target.value);
                                }}
                            />
                        </Group>
                        <Group>
                            <Text fz={13} fw={500} c="gray.6">
                                Chart Type
                            </Text>
                            <CartesianChartTypeConfig
                                canSelectDifferentTypeFromBaseChart={true}
                                type={form.values.type ?? selectedChartType}
                                onChangeType={(
                                    value: NonNullable<
                                        CartesianChartDisplay['series']
                                    >[number]['type'],
                                ) => {
                                    form.setFieldValue('type', value);
                                }}
                            />
                        </Group>
                        <Group position="apart">
                            <Text fz={13} fw={500} c="gray.6">
                                Format
                            </Text>
                            <CartesianChartFormatConfig
                                format={form.values.format}
                                onChangeFormat={(value: Format) => {
                                    form.setFieldValue('format', value);
                                }}
                            />
                        </Group>
                    </Stack>
                </Popover.Dropdown>
            </Popover>

            <SegmentedControl
                radius="md"
                disabled={index !== 0}
                size="xs"
                data={[
                    {
                        value: 'left',
                        label: <MantineIcon icon={IconAlignLeft} />,
                    },
                    {
                        value: 'right',

                        label: <MantineIcon icon={IconAlignRight} />,
                    },
                ]}
                value={position}
                onChange={(value) =>
                    dispatch(
                        actions.setYAxisPosition({
                            index: 0,
                            position: value || undefined,
                        }),
                    )
                }
            />
        </Group>
    );
};

export const CartesianChartSeries: React.FC<CartesianChartSeriesProps> = ({
    selectedChartType,
    actions,
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;

    const series = useAppSelector((state) =>
        cartesianChartSelectors.getSeries(state, selectedChartType, colors),
    );

    return (
        <Config>
            <Config.Section>
                <Stack spacing="xs">
                    {series?.map((seriesItem, index) => (
                        <SeriesItem
                            key={index}
                            {...seriesItem}
                            colors={colors}
                            index={index}
                            actions={actions}
                            selectedChartType={selectedChartType}
                        />
                    ))}
                </Stack>
            </Config.Section>
        </Config>
    );
};
