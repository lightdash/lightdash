import {
    FunnelChartDataInput,
    getItemId,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Group,
    MantineProvider,
    SegmentedControl,
    Stack,
    Tabs,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isFunnelVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { Config } from '../common/Config';
import { themeOverride } from '../mantineTheme';

export const ConfigTabs: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

    const numericFields = Object.values(visualizationConfig.numericFields);
    // const dimensions = Object.values(visualizationConfig.dimensions);

    const { selectedField, fieldChange, dataInput, setDataInput } =
        visualizationConfig.chartConfig;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>
                                    Data orientation
                                </Config.Heading>
                                <Group spacing="xs">
                                    <Config.Label>Input data is</Config.Label>
                                    <SegmentedControl
                                        value={dataInput}
                                        data={[
                                            {
                                                value: FunnelChartDataInput.ROW,
                                                label: 'A row',
                                            },
                                            {
                                                value: FunnelChartDataInput.COLUMN,
                                                label: 'A column',
                                            },
                                        ]}
                                        onChange={(value) =>
                                            setDataInput(
                                                value ===
                                                    FunnelChartDataInput.ROW
                                                    ? FunnelChartDataInput.ROW
                                                    : FunnelChartDataInput.COLUMN,
                                            )
                                        }
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                        <Config>
                            {dataInput === FunnelChartDataInput.COLUMN && (
                                <Config.Section>
                                    <Config.Heading>Data field</Config.Heading>

                                    <Tooltip
                                        variant="xs"
                                        disabled={
                                            numericFields &&
                                            numericFields.length > 0
                                        }
                                        label="You must select at least one numeric metric to create a pie chart"
                                    >
                                        <Box>
                                            <FieldSelect<
                                                Metric | TableCalculation
                                            >
                                                placeholder="Select metric"
                                                disabled={
                                                    numericFields.length === 0
                                                }
                                                item={selectedField}
                                                items={numericFields}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    )
                                                        fieldChange(
                                                            getItemId(newField),
                                                        );
                                                    else if (
                                                        newField &&
                                                        isTableCalculation(
                                                            newField,
                                                        )
                                                    )
                                                        fieldChange(
                                                            newField.name,
                                                        );
                                                    else fieldChange(null);
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Config.Section>
                            )}
                        </Config>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
