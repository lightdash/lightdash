import {
    getItemId,
    isCustomDimension,
    isField,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    MantineProvider,
    SegmentedControl,
    Stack,
    Tabs,
    useMantineColorScheme,
} from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isSankeyVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { getVizConfigThemeOverride } from '../mantineTheme';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    const { visualizationConfig } = useVisualizationContext();

    const isSankey = isSankeyVisualizationConfig(visualizationConfig);

    const allDimensions = useMemo(
        () => (isSankey ? Object.values(visualizationConfig.dimensions) : []),
        [isSankey, visualizationConfig],
    );
    const numericFields = useMemo(
        () =>
            isSankey ? Object.values(visualizationConfig.numericFields) : [],
        [isSankey, visualizationConfig],
    );

    const sourceFieldId = isSankey
        ? visualizationConfig.chartConfig.sourceFieldId
        : null;
    const targetFieldId = isSankey
        ? visualizationConfig.chartConfig.targetFieldId
        : null;
    const metricFieldId = isSankey
        ? visualizationConfig.chartConfig.metricFieldId
        : null;

    const selectedSource = useMemo(() => {
        if (!sourceFieldId) return undefined;
        return allDimensions.find((d) => {
            if (isCustomDimension(d)) return d.id === sourceFieldId;
            if (isField(d)) return getItemId(d) === sourceFieldId;
            return false;
        });
    }, [sourceFieldId, allDimensions]);

    const selectedTarget = useMemo(() => {
        if (!targetFieldId) return undefined;
        return allDimensions.find((d) => {
            if (isCustomDimension(d)) return d.id === targetFieldId;
            if (isField(d)) return getItemId(d) === targetFieldId;
            return false;
        });
    }, [targetFieldId, allDimensions]);

    const selectedMetric = useMemo(() => {
        if (!metricFieldId) return undefined;
        return numericFields.find((f) => {
            if (isField(f)) return getItemId(f) === metricFieldId;
            if (isTableCalculation(f)) return f.name === metricFieldId;
            return false;
        });
    }, [metricFieldId, numericFields]);

    if (!isSankey) return null;

    const {
        onSourceFieldChange,
        onTargetFieldChange,
        onMetricFieldChange,
        nodeAlign,
        onNodeAlignChange,
        orient,
        onOrientChange,
    } = visualizationConfig.chartConfig;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Source</Config.Heading>
                                <FieldSelect<Dimension | CustomDimension>
                                    placeholder="Select source dimension"
                                    disabled={allDimensions.length === 0}
                                    item={selectedSource}
                                    items={allDimensions}
                                    onChange={(newField) => {
                                        if (newField && isField(newField))
                                            onSourceFieldChange(
                                                getItemId(newField),
                                            );
                                        else if (
                                            newField &&
                                            isCustomDimension(newField)
                                        )
                                            onSourceFieldChange(newField.id);
                                        else onSourceFieldChange(null);
                                    }}
                                    hasGrouping
                                />
                            </Config.Section>
                        </Config>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Target</Config.Heading>
                                <FieldSelect<Dimension | CustomDimension>
                                    placeholder="Select target dimension"
                                    disabled={allDimensions.length === 0}
                                    item={selectedTarget}
                                    items={allDimensions}
                                    onChange={(newField) => {
                                        if (newField && isField(newField))
                                            onTargetFieldChange(
                                                getItemId(newField),
                                            );
                                        else if (
                                            newField &&
                                            isCustomDimension(newField)
                                        )
                                            onTargetFieldChange(newField.id);
                                        else onTargetFieldChange(null);
                                    }}
                                    hasGrouping
                                />
                            </Config.Section>
                        </Config>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Value</Config.Heading>
                                <FieldSelect<Metric | TableCalculation>
                                    placeholder="Select metric"
                                    disabled={numericFields.length === 0}
                                    item={selectedMetric}
                                    items={numericFields}
                                    onChange={(newField) => {
                                        if (newField && isField(newField))
                                            onMetricFieldChange(
                                                getItemId(newField),
                                            );
                                        else if (
                                            newField &&
                                            isTableCalculation(newField)
                                        )
                                            onMetricFieldChange(newField.name);
                                        else onMetricFieldChange(null);
                                    }}
                                    hasGrouping
                                />
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Orientation</Config.Heading>
                                <SegmentedControl
                                    value={orient}
                                    data={[
                                        {
                                            value: 'horizontal',
                                            label: 'Horizontal',
                                        },
                                        {
                                            value: 'vertical',
                                            label: 'Vertical',
                                        },
                                    ]}
                                    onChange={(value) =>
                                        onOrientChange(
                                            value as 'horizontal' | 'vertical',
                                        )
                                    }
                                />
                            </Config.Section>
                        </Config>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Node alignment</Config.Heading>
                                <SegmentedControl
                                    value={nodeAlign}
                                    data={[
                                        {
                                            value: 'left',
                                            label:
                                                orient === 'vertical'
                                                    ? 'Top'
                                                    : 'Left',
                                        },
                                        {
                                            value: 'right',
                                            label:
                                                orient === 'vertical'
                                                    ? 'Bottom'
                                                    : 'Right',
                                        },
                                        {
                                            value: 'justify',
                                            label: 'Justify',
                                        },
                                    ]}
                                    onChange={(value) =>
                                        onNodeAlignChange(
                                            value as
                                                | 'left'
                                                | 'right'
                                                | 'justify',
                                        )
                                    }
                                />
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
