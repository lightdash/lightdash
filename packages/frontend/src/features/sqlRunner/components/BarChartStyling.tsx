import { XLayoutType } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import {
    setSeriesLabel,
    setXAxisLabel,
    setYAxisLabel,
    setYAxisPosition,
} from '../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

const DEBOUNCE_TIME = 500;

export const BarChartStyling = () => {
    const dispatch = useAppDispatch();

    const series = useAppSelector((state) => {
        if (
            !state.barChartConfig.config?.fieldConfig?.y ||
            state.barChartConfig.config.fieldConfig.y.length <= 1
        ) {
            return [];
        }
        return state.barChartConfig.config.fieldConfig.y.map((field, index) => {
            const label = Object.values(
                state.barChartConfig.config?.display?.series || {},
            ).find((s) => s.yAxisIndex === index)?.label;
            return {
                reference: field.reference,
                label: label || field.reference,
            };
        });
    });

    console.log({ series });

    const xAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.xAxis?.label ??
            state.barChartConfig.config?.fieldConfig?.x?.reference,
    );

    const yAxisLabel = useAppSelector(
        (state) =>
            state.barChartConfig.config?.display?.yAxis?.[0]?.label ??
            state.barChartConfig.config?.fieldConfig?.y?.[0]?.reference,
    );
    const yAxisPosition = useAppSelector(
        (state) => state.barChartConfig.config?.display?.yAxis?.[0]?.position,
    );
    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(setXAxisLabel({ label, type: XLayoutType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    const onYAxisPositionChange = debounce((position: string | undefined) => {
        dispatch(setYAxisPosition({ index: 0, position }));
    }, DEBOUNCE_TIME);

    const onSeriesLabelChange = debounce(
        (index: number, label: string, reference: string) => {
            dispatch(setSeriesLabel({ index, label, reference }));
        },
        DEBOUNCE_TIME,
    );

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis label`}</Config.Heading>

                    <TextInput
                        defaultValue={xAxisLabel}
                        radius="md"
                        onChange={(e) => onXAxisLabelChange(e.target.value)}
                    />
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis label`}</Config.Heading>
                    <TextInput
                        defaultValue={yAxisLabel}
                        radius="md"
                        onChange={(e) => onYAxisLabelChange(e.target.value)}
                    />
                    <Config.Group>
                        <Config.Label>{`Y-axis position`}</Config.Label>
                        <SegmentedControl
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
                            defaultValue={yAxisPosition}
                            onChange={(value) =>
                                onYAxisPositionChange(value || undefined)
                            }
                        />
                    </Config.Group>
                    <Config.Subheading>Series</Config.Subheading>

                    {series.map((s, index) => (
                        <Config.Group key={index}>
                            <Config.Label>{`Series ${index + 1}`}</Config.Label>
                            <Group spacing="xs">
                                <TextInput
                                    defaultValue={s.label}
                                    radius="md"
                                    onChange={(e) =>
                                        onSeriesLabelChange(
                                            index,
                                            e.target.value,
                                            s.reference,
                                        )
                                    }
                                />
                            </Group>
                        </Config.Group>
                    ))}
                </Config.Section>
            </Config>
        </Stack>
    );
};
