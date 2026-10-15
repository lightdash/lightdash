import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getGranularityMapFromItems,
    getItemId,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Collapse,
    Group,
    Stack,
    SegmentedControl,
    Switch,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { isFunnelVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { Config } from '../common/Config';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { StepConfig } from './StepConfig';

export const ConfigTabs: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

    const granularityFields = Object.keys(getGranularityMapFromItems(itemsMap));

    const numericFields = Object.values(visualizationConfig.numericFields);
    // TODO: dimensions should be selectable for labels
    // const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        selectedField,
        onFieldChange,
        dataInput,
        setDataInput,
        labels,
        onLabelsChange,
        labelOverrides,
        onLabelOverridesChange,
        colorDefaults,
        colorOverrides,
        onColorOverridesChange,
        data,
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
    } = visualizationConfig.chartConfig;

    // Match the rendered step order: query order when steps come from rows,
    // descending taper otherwise
    const orderedSteps =
        dataInput === FunnelChartDataInput.COLUMN
            ? data
            : [...data].sort((a, b) => b.value - a.value);

    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'general',
                    label: t('funnel.tabs.general'),
                    panel: (
                        <Stack>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('funnel.dataOrientation')}
                                    </Config.Heading>
                                    <Group gap="xs">
                                        <Config.Label>
                                            {t('funnel.stepsAre')}
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={dataInput}
                                            data={[
                                                {
                                                    value: FunnelChartDataInput.COLUMN,
                                                    label: t('funnel.rows'),
                                                },
                                                {
                                                    value: FunnelChartDataInput.ROW,
                                                    label: t('funnel.columns'),
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
                                        <Config.Heading>
                                            {t('funnel.dataField')}
                                        </Config.Heading>

                                        <Tooltip
                                            disabled={
                                                numericFields &&
                                                numericFields.length > 0
                                            }
                                            label={t('funnel.needMetric')}
                                        >
                                            <Box>
                                                <FieldSelect<
                                                    Metric | TableCalculation
                                                >
                                                    placeholder={t(
                                                        'funnel.selectMetric',
                                                    )}
                                                    disabled={
                                                        numericFields.length ===
                                                        0
                                                    }
                                                    item={selectedField}
                                                    items={numericFields}
                                                    onChange={(newField) => {
                                                        if (
                                                            newField &&
                                                            isField(newField)
                                                        )
                                                            onFieldChange(
                                                                getItemId(
                                                                    newField,
                                                                ),
                                                            );
                                                        else if (
                                                            newField &&
                                                            isTableCalculation(
                                                                newField,
                                                            )
                                                        )
                                                            onFieldChange(
                                                                newField.name,
                                                            );
                                                        else
                                                            onFieldChange(null);
                                                    }}
                                                    hasGrouping
                                                />
                                            </Box>
                                        </Tooltip>
                                    </Config.Section>
                                )}
                            </Config>
                        </Stack>
                    ),
                },
                {
                    value: 'steps',
                    label: t('funnel.tabs.steps'),
                    panel: (
                        <Stack>
                            <ColorPaletteSection />
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('funnel.labels')}
                                    </Config.Heading>

                                    <Group gap="xs" wrap="nowrap">
                                        <Config.Label>
                                            {t('funnel.position')}
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={labels?.position}
                                            data={[
                                                {
                                                    value: FunnelChartLabelPosition.LEFT,
                                                    label: t('funnel.left'),
                                                },

                                                {
                                                    value: FunnelChartLabelPosition.INSIDE,
                                                    label: t('funnel.inside'),
                                                },
                                                {
                                                    value: FunnelChartLabelPosition.RIGHT,
                                                    label: t('funnel.right'),
                                                },
                                                {
                                                    value: FunnelChartLabelPosition.HIDDEN,
                                                    label: t('funnel.hidden'),
                                                },
                                            ]}
                                            onChange={(newPosition) =>
                                                onLabelsChange({
                                                    position:
                                                        newPosition as FunnelChartLabelPosition,
                                                })
                                            }
                                        />
                                    </Group>

                                    <Group gap="xs">
                                        <Checkbox
                                            size="xs"
                                            checked={labels?.showValue}
                                            onChange={(newValue) =>
                                                onLabelsChange({
                                                    showValue:
                                                        newValue.currentTarget
                                                            .checked,
                                                })
                                            }
                                            label={t('funnel.showValue')}
                                        />

                                        <Checkbox
                                            size="xs"
                                            checked={labels?.showPercentage}
                                            onChange={(newValue) =>
                                                onLabelsChange({
                                                    showPercentage:
                                                        newValue.currentTarget
                                                            .checked,
                                                })
                                            }
                                            label={t('funnel.showPercentage')}
                                        />
                                    </Group>
                                </Config.Section>
                            </Config>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        {t('funnel.steps')}
                                    </Config.Heading>
                                    {orderedSteps.map((step) => {
                                        return (
                                            <StepConfig
                                                key={step.id}
                                                id={step.id}
                                                defaultColor={
                                                    colorDefaults[step.id]
                                                }
                                                defaultLabel={step.name}
                                                swatches={[]}
                                                color={colorOverrides[step.id]}
                                                label={labelOverrides[step.id]}
                                                granularityFields={
                                                    granularityFields
                                                }
                                                onColorChange={
                                                    onColorOverridesChange
                                                }
                                                onLabelChange={
                                                    onLabelOverridesChange
                                                }
                                            />
                                        );
                                    })}
                                </Config.Section>
                            </Config>
                        </Stack>
                    ),
                },
                {
                    value: 'display',
                    label: t('funnel.tabs.display'),
                    panel: (
                        <Stack>
                            <Config>
                                <Group>
                                    <Config.Heading>
                                        {t('funnel.showLegend')}
                                    </Config.Heading>
                                    <Switch
                                        size="xs"
                                        checked={showLegend}
                                        onChange={toggleShowLegend}
                                    />
                                </Group>
                            </Config>

                            <Collapse expanded={showLegend}>
                                <Group gap="xs">
                                    <Config.Label>
                                        {t('funnel.orientation')}
                                    </Config.Label>
                                    <SegmentedControl
                                        size="xs"
                                        name="orient"
                                        value={legendPosition}
                                        onChange={(value) =>
                                            legendPositionChange(
                                                value as FunnelChartLegendPosition,
                                            )
                                        }
                                        data={[
                                            {
                                                value: FunnelChartLegendPosition.HORIZONTAL,
                                                label: t('funnel.horizontal'),
                                            },
                                            {
                                                value: FunnelChartLegendPosition.VERTICAL,
                                                label: t('funnel.vertical'),
                                            },
                                        ]}
                                    />
                                </Group>
                            </Collapse>
                        </Stack>
                    ),
                },
            ]}
        />
    );
});
