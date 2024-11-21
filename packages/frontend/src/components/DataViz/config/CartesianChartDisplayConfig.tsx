import { type ChartKind } from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Space,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import MantineIcon from '../../common/MantineIcon';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

export const CartesianChartDisplayConfig = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const dispatch = useVizDispatch();

    const currentConfig = useVizSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const xAxisLabel = useMemo(() => {
        return (
            currentConfig?.display?.xAxis?.label ??
            currentConfig?.fieldConfig?.x?.reference
        );
    }, [currentConfig]);
    const yAxisLabel = useMemo(() => {
        return (
            currentConfig?.display?.yAxis?.[0]?.label ??
            currentConfig?.fieldConfig?.y?.[0]?.reference
        );
    }, [currentConfig]);

    const yAxisPosition = currentConfig?.display?.yAxis?.[0]?.position;

    return (
        <Stack spacing="xl" mt="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis label`}</Config.Heading>
                    <TextInput
                        value={xAxisLabel || ''}
                        radius="md"
                        onChange={(e) =>
                            dispatch(
                                actions.setXAxisLabel({
                                    label: e.target.value,
                                }),
                            )
                        }
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis`}</Config.Heading>
                    <Group noWrap w="100%">
                        <Config.Label>{`Label`}</Config.Label>
                        <TextInput
                            w="100%"
                            value={yAxisLabel || ''}
                            radius="md"
                            onChange={(e) =>
                                dispatch(
                                    actions.setYAxisLabel({
                                        index: 0,
                                        label: e.target.value,
                                    }),
                                )
                            }
                        />
                    </Group>

                    <Config.Group>
                        <Config.Label>{`Format`}</Config.Label>
                        <CartesianChartFormatConfig
                            format={currentConfig?.display?.yAxis?.[0]?.format}
                            onChangeFormat={(value) => {
                                dispatch(
                                    actions.setYAxisFormat({
                                        format: value,
                                    }),
                                );
                            }}
                        />
                    </Config.Group>
                    <Config.Group>
                        <Space />
                        <SegmentedControl
                            sx={{ alignSelf: 'center' }}
                            radius="md"
                            data={[
                                {
                                    value: 'left',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <MantineIcon icon={IconAlignLeft} />
                                            <Text>Left</Text>
                                        </Group>
                                    ),
                                },
                                {
                                    value: 'right',
                                    label: (
                                        <Group spacing="xs" noWrap>
                                            <Text>Right</Text>
                                            <MantineIcon
                                                icon={IconAlignRight}
                                            />
                                        </Group>
                                    ),
                                },
                            ]}
                            value={yAxisPosition}
                            onChange={(value) =>
                                dispatch(
                                    actions.setYAxisPosition({
                                        index: 0,
                                        position: value || undefined,
                                    }),
                                )
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
        </Stack>
    );
};
