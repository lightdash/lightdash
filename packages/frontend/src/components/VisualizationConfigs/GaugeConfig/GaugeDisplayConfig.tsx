import {
    getGranularityMapFromItems,
    getItemId,
    getItemLabelWithoutTableName,
} from '@lightdash/common';
import {
    Center,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { NumberInput } from '../../common/NumberInput';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { LabelEditor } from '../common/LabelEditor';
import GaugeSections from './GaugeSections';
import { GaugeValueMode } from './types';

export const GaugeDisplayConfig: FC = memo(() => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isGaugeVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const granularityFields = Object.keys(getGranularityMapFromItems(itemsMap));

    const {
        chartConfig: {
            selectedField: selectedFieldId,
            min,
            setMin,
            max,
            setMax,
            maxFieldId,
            setMaxFieldId,
            getField,
            showAxisLabels,
            setShowAxisLabels,
            customLabel,
            setCustomLabel,
            showPercentage,
            setShowPercentage,
            customPercentageLabel,
            setCustomPercentageLabel,
        },
        numericMetrics,
    } = visualizationConfig;

    const maxValueMode = maxFieldId
        ? GaugeValueMode.FIELD
        : GaugeValueMode.FIXED;
    const maxField = getField(maxFieldId);
    const selectedField = getField(selectedFieldId);

    const numericMetricsList = Object.values(numericMetrics ?? {});

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>{t('gauge.display.scale')}</Config.Heading>
                    <NumberInput
                        size="xs"
                        label={t('gauge.display.minimumValue')}
                        description={t('gauge.display.minimumValueDescription')}
                        value={min}
                        onNumberChange={(value) => setMin(value ?? 0)}
                        placeholder="0"
                        decimalScale={2}
                    />
                    <Group gap="xs" align="flex-end">
                        {maxValueMode === GaugeValueMode.FIXED ? (
                            <NumberInput
                                size="xs"
                                label={t('gauge.display.maximumValue')}
                                description={t(
                                    'gauge.display.maximumValueDescription',
                                )}
                                value={max}
                                onNumberChange={(value) => setMax(value ?? 0)}
                                placeholder="100"
                                decimalScale={2}
                                flex={1}
                            />
                        ) : (
                            <FieldSelect
                                label={t('gauge.display.maximumValue')}
                                description={t(
                                    'gauge.display.maximumFieldDescription',
                                )}
                                item={maxField}
                                items={numericMetricsList}
                                onChange={(newValue) => {
                                    setMaxFieldId(
                                        newValue
                                            ? getItemId(newValue)
                                            : undefined,
                                    );
                                }}
                                hasGrouping
                                flex={1}
                            />
                        )}
                        <SegmentedControl
                            size="xs"
                            value={maxValueMode}
                            onChange={(value) => {
                                if (value === GaugeValueMode.FIXED) {
                                    // When switching to fixed mode, clear the field selection
                                    setMaxFieldId(undefined);
                                } else {
                                    // When switching to field mode, set to first available field
                                    if (numericMetricsList.length > 0) {
                                        setMaxFieldId(
                                            getItemId(numericMetricsList[0]),
                                        );
                                    }
                                }
                            }}
                            data={[
                                {
                                    label: (
                                        <Tooltip
                                            label={t(
                                                'gauge.display.setMaxValue',
                                            )}
                                        >
                                            <Center>
                                                {t('gauge.display.value')}
                                            </Center>
                                        </Tooltip>
                                    ),
                                    value: GaugeValueMode.FIXED,
                                },
                                {
                                    label: (
                                        <Tooltip
                                            label={t(
                                                'gauge.display.maximumFieldDescription',
                                            )}
                                        >
                                            <Center>
                                                {t('gauge.display.field')}
                                            </Center>
                                        </Tooltip>
                                    ),
                                    value: GaugeValueMode.FIELD,
                                },
                            ]}
                        />
                    </Group>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t('gauge.display.appearance')}
                    </Config.Heading>

                    <Checkbox
                        size="xs"
                        label={t('gauge.display.showAxisLabels')}
                        description={t(
                            'gauge.display.showAxisLabelsDescription',
                        )}
                        checked={showAxisLabels}
                        onChange={(event) =>
                            setShowAxisLabels(event.currentTarget.checked)
                        }
                    />

                    <Checkbox
                        size="xs"
                        label={t('gauge.display.showAsPercentage')}
                        description={t(
                            'gauge.display.showAsPercentageDescription',
                        )}
                        checked={showPercentage}
                        onChange={(event) =>
                            setShowPercentage(event.currentTarget.checked)
                        }
                    />

                    {showPercentage && (
                        <LabelEditor
                            label={t('gauge.display.customPercentageLabel')}
                            description={t(
                                'gauge.display.customPercentageLabelDescription',
                            )}
                            value={customPercentageLabel || ''}
                            onChange={(value) =>
                                setCustomPercentageLabel(value || undefined)
                            }
                            fields={granularityFields}
                            placeholder={t(
                                'gauge.display.customPercentageLabelPlaceholder',
                            )}
                        />
                    )}

                    <LabelEditor
                        label={t('gauge.display.customLabel')}
                        description={t('gauge.display.customLabelDescription')}
                        value={customLabel || ''}
                        onChange={(value) => setCustomLabel(value || undefined)}
                        fields={granularityFields}
                        placeholder={
                            selectedField
                                ? getItemLabelWithoutTableName(selectedField)
                                : t('gauge.display.customLabelPlaceholder')
                        }
                    />
                </Config.Section>
            </Config>
            <GaugeSections />
        </Stack>
    );
});
