import {
    getItemId,
    isCustomDimension,
    isField,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type Metric,
    type SankeyNodeLayout,
    type TableCalculation,
} from '@lightdash/common';
import { Stack, Text, SegmentedControl } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { isSankeyVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
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
        nodeLayout,
        onNodeLayoutChange,
        data,
    } = visualizationConfig.chartConfig;

    // Merging needs an acyclic graph, so cyclic data falls back to multi-step
    const effectiveLayout: SankeyNodeLayout =
        nodeLayout === 'merged' && data.hasCycle ? 'multi-step' : nodeLayout;

    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'general',
                    label: t('sankey.tabs.general'),
                    panel: (
                        <Stack>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('sankey.source')}
                                    </Config.Heading>
                                    <FieldSelect<Dimension | CustomDimension>
                                        placeholder={t(
                                            'sankey.selectSourceDimension',
                                        )}
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
                                                onSourceFieldChange(
                                                    newField.id,
                                                );
                                            else onSourceFieldChange(null);
                                        }}
                                        hasGrouping
                                    />
                                </Config.Section>
                            </Config>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('sankey.target')}
                                    </Config.Heading>
                                    <FieldSelect<Dimension | CustomDimension>
                                        placeholder={t(
                                            'sankey.selectTargetDimension',
                                        )}
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
                                                onTargetFieldChange(
                                                    newField.id,
                                                );
                                            else onTargetFieldChange(null);
                                        }}
                                        hasGrouping
                                    />
                                </Config.Section>
                            </Config>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('sankey.value')}
                                    </Config.Heading>
                                    <FieldSelect<Metric | TableCalculation>
                                        placeholder={t('sankey.selectMetric')}
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
                                                onMetricFieldChange(
                                                    newField.name,
                                                );
                                            else onMetricFieldChange(null);
                                        }}
                                        hasGrouping
                                    />
                                </Config.Section>
                            </Config>
                        </Stack>
                    ),
                },
                {
                    value: 'display',
                    label: t('sankey.tabs.display'),
                    panel: (
                        <Stack>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('sankey.orientation')}
                                    </Config.Heading>
                                    <SegmentedControl
                                        size="xs"
                                        value={orient}
                                        data={[
                                            {
                                                value: 'horizontal',
                                                label: t('sankey.horizontal'),
                                            },
                                            {
                                                value: 'vertical',
                                                label: t('sankey.vertical'),
                                            },
                                        ]}
                                        onChange={(value) =>
                                            onOrientChange(
                                                value as
                                                    | 'horizontal'
                                                    | 'vertical',
                                            )
                                        }
                                    />
                                </Config.Section>
                            </Config>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('sankey.nodeLayout')}
                                    </Config.Heading>
                                    <SegmentedControl
                                        size="xs"
                                        value={effectiveLayout}
                                        data={[
                                            {
                                                value: 'multi-step',
                                                label: t('sankey.multiStep'),
                                            },
                                            {
                                                value: 'merged',
                                                label: t('sankey.merged'),
                                                disabled: data.hasCycle,
                                            },
                                            {
                                                value: 'direct',
                                                label: t('sankey.direct'),
                                            },
                                        ]}
                                        onChange={(value) =>
                                            onNodeLayoutChange(
                                                value as SankeyNodeLayout,
                                            )
                                        }
                                    />
                                    {data.hasCycle && (
                                        <Text size="xs" c="dimmed" mt="xs">
                                            {t('sankey.mergingUnavailable')}
                                        </Text>
                                    )}
                                </Config.Section>
                            </Config>
                            {effectiveLayout !== 'direct' && (
                                <Config>
                                    <Config.Section>
                                        <Config.Heading>
                                            {t('sankey.nodeAlignment')}
                                        </Config.Heading>
                                        <SegmentedControl
                                            size="xs"
                                            value={nodeAlign}
                                            data={[
                                                {
                                                    value: 'left',
                                                    label:
                                                        orient === 'vertical'
                                                            ? t('sankey.top')
                                                            : t('sankey.left'),
                                                },
                                                {
                                                    value: 'right',
                                                    label:
                                                        orient === 'vertical'
                                                            ? t('sankey.bottom')
                                                            : t('sankey.right'),
                                                },
                                                {
                                                    value: 'justify',
                                                    label: t('sankey.justify'),
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
                            )}
                        </Stack>
                    ),
                },
            ]}
        />
    );
});
