import { XLayoutType } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconAlignLeft, IconAlignRight } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { type CartesianChartActionsType } from '../store';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectCurrentCartesianChartState } from '../store/selectors';

const DEBOUNCE_TIME = 500;

export const LineChartStyling = ({
    actions,
}: {
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useAppDispatch();

    const currentConfig = useAppSelector(selectCurrentCartesianChartState);

    const xAxisLabel =
        currentConfig?.config?.display?.xAxis?.label ??
        currentConfig?.config?.fieldConfig?.x?.reference;
    const yAxisLabel =
        currentConfig?.config?.display?.yAxis?.[0]?.label ??
        currentConfig?.config?.fieldConfig?.y?.[0]?.reference;
    const yAxisPosition = currentConfig?.config?.display?.yAxis?.[0]?.position;

    const onXAxisLabelChange = debounce((label: string) => {
        dispatch(actions.setXAxisLabel({ label, type: XLayoutType.CATEGORY }));
    }, DEBOUNCE_TIME);

    const onYAxisLabelChange = debounce((label: string) => {
        dispatch(actions.setYAxisLabel({ index: 0, label }));
    }, DEBOUNCE_TIME);

    const onYAxisPositionChange = debounce((position: string | undefined) => {
        dispatch(actions.setYAxisPosition({ index: 0, position }));
    }, DEBOUNCE_TIME);

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
