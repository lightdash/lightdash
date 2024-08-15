import { IndexType } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { type CartesianChartActionsType } from '../store';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { CartesianChartFormatConfig } from './CartesianChartFormatConfig';

const DEBOUNCE_TIME = 500;

export const CartesianChartStyling = ({
    actions,
}: {
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useAppDispatch();

    const currentConfig = useAppSelector(selectCurrentCartesianChartState);
    const series = useAppSelector((state) => {
        if (
            !state.barChartConfig.config?.fieldConfig?.y ||
            state.barChartConfig.config.fieldConfig.y.length <= 1
        ) {
            return [];
        }
        return state.barChartConfig.config.fieldConfig.y.map((f) => {
            const format =
                state.barChartConfig.config?.display?.series?.[f.reference]
                    ?.format;
            return {
                reference: f.reference,
                format,
            };
        });
    });

    const xAxisLabel =
        currentConfig?.config?.display?.xAxis?.label ??
        currentConfig?.config?.fieldConfig?.x?.reference;
    const yAxisLabel =
        currentConfig?.config?.display?.yAxis?.[0]?.label ??
        currentConfig?.config?.fieldConfig?.y?.[0]?.reference;
    const yAxisPosition = currentConfig?.config?.display?.yAxis?.[0]?.position;

    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(actions.setXAxisLabel({ label, type: IndexType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(actions.setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    const onYAxisPositionChange = debounce((position: string | undefined) => {
        dispatch(actions.setYAxisPosition({ index: 0, position }));
    }, DEBOUNCE_TIME);

    const onStackedChange = debounce((isStacked: boolean) => {
        dispatch(actions.setStacked(isStacked));
    }, DEBOUNCE_TIME);

    return (
        <Stack spacing="xs">
            <Config>
                <Config.Group>
                    <Config.Label>{`Stacking`}</Config.Label>
                    <SegmentedControl
                        radius="md"
                        disabled={!currentConfig?.config?.fieldConfig?.groupBy}
                        data={[
                            {
                                value: 'None',
                                label: 'None',
                            },
                            {
                                value: 'Stacked',
                                label: 'Stacked',
                            },
                        ]}
                        defaultValue={
                            currentConfig?.config?.display?.stack
                                ? 'Stacked'
                                : 'None'
                        }
                        onChange={(value) =>
                            onStackedChange(value === 'Stacked')
                        }
                    />
                </Config.Group>
            </Config>
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
                    <Config.Heading>{`Y-axis`}</Config.Heading>
                    <Config.Group>
                        <Config.Label>{`Label`}</Config.Label>
                        <TextInput
                            defaultValue={yAxisLabel}
                            radius="md"
                            onChange={(e) => onYAxisLabelChange(e.target.value)}
                        />
                    </Config.Group>
                    {series.length < 1 && (
                        <Config.Group>
                            <Config.Label>{`Format`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={
                                    currentConfig?.config?.display?.yAxis?.[0]
                                        ?.format
                                }
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setYAxisFormat({
                                            format: value,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    )}
                    {series.length > 1 && (
                        <Config.Subheading>Series</Config.Subheading>
                    )}
                    {series.map((s, index) => (
                        <Config.Group key={index}>
                            <Config.Label>{`Series ${index + 1}`}</Config.Label>
                            <CartesianChartFormatConfig
                                format={s.format}
                                onChangeFormat={(value) => {
                                    dispatch(
                                        actions.setSeriesFormat({
                                            index,
                                            format: value,
                                            reference: s.reference,
                                        }),
                                    );
                                }}
                            />
                        </Config.Group>
                    ))}

                    <Config.Group>
                        <Config.Label>{`Position`}</Config.Label>
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
                </Config.Section>
            </Config>
        </Stack>
    );
};
