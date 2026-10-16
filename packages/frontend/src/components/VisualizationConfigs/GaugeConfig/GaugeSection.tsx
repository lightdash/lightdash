import {
    getItemId,
    getItemLabelWithoutTableName,
    type GaugeSection,
} from '@lightdash/common';
import {
    Accordion,
    Center,
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
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';
import { GaugeValueMode } from './types';

export type Props = {
    onClick: () => void;
    index: number;
    section: GaugeSection;
    onUpdate: (index: number, updatedSection: Partial<GaugeSection>) => void;
    onRemove: (index: number) => void;
};

const GaugeSectionComponent: FC<Props> = memo(
    ({ index, onClick, section, onUpdate, onRemove }) => {
        const { t } = useTranslation('vizConfig');
        const { colorPalette, visualizationConfig } = useVisualizationContext();

        if (!isGaugeVisualizationConfig(visualizationConfig)) {
            return null;
        }

        const {
            chartConfig: { getField },
            numericMetrics,
        } = visualizationConfig;

        const minValueMode = section.minFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
        const maxValueMode = section.maxFieldId
            ? GaugeValueMode.FIELD
            : GaugeValueMode.FIXED;
        const minField = getField(section.minFieldId);
        const maxField = getField(section.maxFieldId);
        const numericMetricsList = Object.values(numericMetrics ?? {});

        const minLabel = minField
            ? getItemLabelWithoutTableName(minField)
            : section.min != null
              ? String(section.min)
              : undefined;
        const maxLabel = maxField
            ? getItemLabelWithoutTableName(maxField)
            : section.max != null
              ? String(section.max)
              : undefined;
        const description =
            minLabel !== undefined && maxLabel !== undefined
                ? `${minLabel} – ${maxLabel}`
                : undefined;

        return (
            <Accordion.Item value={`${index}`}>
                <AccordionControl
                    label={t('gauge.sections.sectionNumber', {
                        number: index + 1,
                    })}
                    description={description}
                    onControlClick={onClick}
                    onRemove={() => onRemove(index)}
                    extraControlElements={
                        <ColorSelector
                            color={section.color}
                            swatches={colorPalette}
                            onColorChange={(color) =>
                                onUpdate(index, { color })
                            }
                        />
                    }
                />
                <Accordion.Panel>
                    <Stack gap="md">
                        <Group gap="xs" align="flex-end">
                            {minValueMode === GaugeValueMode.FIXED ? (
                                <NumberInput
                                    size="xs"
                                    label={t('gauge.sections.minValue')}
                                    description={t(
                                        'gauge.sections.minValueDescription',
                                    )}
                                    value={section.min}
                                    onChange={(value) =>
                                        onUpdate(index, { min: Number(value) })
                                    }
                                    flex={1}
                                    decimalScale={2}
                                />
                            ) : (
                                <FieldSelect
                                    label={t('gauge.sections.minValue')}
                                    description={t(
                                        'gauge.sections.minFieldDescription',
                                    )}
                                    item={minField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(index, {
                                            minFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                    flex={1}
                                />
                            )}
                            <SegmentedControl
                                value={minValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
                                        onUpdate(index, {
                                            minFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(index, {
                                                minFieldId: getItemId(
                                                    numericMetricsList[0],
                                                ),
                                            });
                                        }
                                    }
                                }}
                                data={[
                                    {
                                        label: (
                                            <Tooltip
                                                label={t(
                                                    'gauge.sections.setMinValue',
                                                )}
                                            >
                                                <Center>
                                                    {t('gauge.sections.value')}
                                                </Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIXED,
                                    },
                                    {
                                        label: (
                                            <Tooltip
                                                label={t(
                                                    'gauge.sections.maxFieldDescription',
                                                )}
                                            >
                                                <Center>
                                                    {t('gauge.sections.field')}
                                                </Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIELD,
                                    },
                                ]}
                            />
                        </Group>

                        <Group gap="xs" align="flex-end">
                            {maxValueMode === GaugeValueMode.FIXED ? (
                                <NumberInput
                                    size="xs"
                                    label={t('gauge.sections.maxValue')}
                                    description={t(
                                        'gauge.sections.maxValueDescription',
                                    )}
                                    value={section.max}
                                    onChange={(value) =>
                                        onUpdate(index, { max: Number(value) })
                                    }
                                    decimalScale={2}
                                    flex={1}
                                />
                            ) : (
                                <FieldSelect
                                    label={t('gauge.sections.maxValue')}
                                    description={t(
                                        'gauge.sections.maxFieldDescription',
                                    )}
                                    item={maxField}
                                    items={numericMetricsList}
                                    onChange={(newValue) => {
                                        onUpdate(index, {
                                            maxFieldId: newValue
                                                ? getItemId(newValue)
                                                : undefined,
                                        });
                                    }}
                                    hasGrouping
                                    flex={1}
                                />
                            )}
                            <SegmentedControl
                                value={maxValueMode}
                                onChange={(value) => {
                                    if (value === GaugeValueMode.FIXED) {
                                        onUpdate(index, {
                                            maxFieldId: undefined,
                                        });
                                    } else {
                                        if (numericMetricsList.length > 0) {
                                            onUpdate(index, {
                                                maxFieldId: getItemId(
                                                    numericMetricsList[0],
                                                ),
                                            });
                                        }
                                    }
                                }}
                                data={[
                                    {
                                        label: (
                                            <Tooltip
                                                label={t(
                                                    'gauge.sections.setMaxValue',
                                                )}
                                            >
                                                <Center>
                                                    {t('gauge.sections.value')}
                                                </Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIXED,
                                    },
                                    {
                                        label: (
                                            <Tooltip
                                                label={t(
                                                    'gauge.sections.maxFieldDescription',
                                                )}
                                            >
                                                <Center>
                                                    {t('gauge.sections.field')}
                                                </Center>
                                            </Tooltip>
                                        ),
                                        value: GaugeValueMode.FIELD,
                                    },
                                ]}
                            />
                        </Group>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        );
    },
);

export default GaugeSectionComponent;
