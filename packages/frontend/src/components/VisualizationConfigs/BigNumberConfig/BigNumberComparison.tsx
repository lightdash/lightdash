import {
    ComparisonFormatTypes,
    getItemId,
    type CompactOrAlias,
} from '@lightdash/common';
import { Group, SegmentedControl, Select, Stack, Switch } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldSelect from '../../common/FieldSelect';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { LabelEditor } from '../common/LabelEditor';
import classes from './BigNumberComparison.module.css';
import { getStyleOptions } from './common';

type CompareTarget = 'previous_row' | 'another_field';

export const Comparison: React.FC = () => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const styleOptions = useMemo(
        () => getStyleOptions(t('state.none', { ns: 'common' })),
        [t],
    );

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);
    const chartConfig = isBigNumber
        ? visualizationConfig.chartConfig
        : undefined;

    const rememberedField = useRef(chartConfig?.comparisonField);

    const [compareTarget, setCompareTarget] = useState<CompareTarget>(
        chartConfig?.comparisonField !== undefined
            ? 'another_field'
            : 'previous_row',
    );

    useEffect(() => {
        setCompareTarget(
            chartConfig?.comparisonField !== undefined
                ? 'another_field'
                : 'previous_row',
        );
    }, [chartConfig?.comparisonField]);

    if (!isBigNumber || !chartConfig) return null;

    const {
        bigNumberComparisonStyle,
        setBigNumberComparisonStyle,
        showStyle,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        flipColors,
        setFlipColors,
        comparisonLabel,
        setComparisonLabel,
        selectedField,
        getField,
        comparisonField,
        setComparisonField,
        granularityFields,
    } = chartConfig;

    const comparisonFieldItem = getField(comparisonField);

    const comparisonFieldItems = Object.values(itemsMap ?? {}).filter(
        (item) => getItemId(item) !== selectedField,
    );

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group gap="xs" align="center">
                        <Config.Heading>
                            {t('bigNumber.comparison.showComparison')}
                        </Config.Heading>
                        <Switch
                            size="xs"
                            checked={showComparison}
                            onChange={() => {
                                setShowComparison(!showComparison);
                            }}
                        />
                    </Group>

                    {showComparison ? (
                        <>
                            <Group gap="xs">
                                <Config.Label>
                                    {t('bigNumber.comparison.compareTo')}
                                </Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: 'previous_row' as CompareTarget,
                                            label: t(
                                                'bigNumber.comparison.previousRow',
                                            ),
                                        },
                                        {
                                            value: 'another_field' as CompareTarget,
                                            label: t(
                                                'bigNumber.comparison.sameRow',
                                            ),
                                        },
                                    ]}
                                    value={compareTarget}
                                    onChange={(value) => {
                                        const target = value as CompareTarget;
                                        setCompareTarget(target);
                                        if (target === 'previous_row') {
                                            rememberedField.current =
                                                comparisonField;
                                            setComparisonField(undefined);
                                        } else {
                                            setComparisonField(
                                                rememberedField.current,
                                            );
                                        }
                                    }}
                                />
                            </Group>

                            {compareTarget === 'another_field' && (
                                <FieldSelect
                                    label={t('bigNumber.comparison.field')}
                                    item={comparisonFieldItem}
                                    items={comparisonFieldItems}
                                    onChange={(newValue) => {
                                        const fieldId = newValue
                                            ? getItemId(newValue)
                                            : undefined;
                                        rememberedField.current = fieldId;
                                        setComparisonField(fieldId);
                                    }}
                                    hasGrouping
                                />
                            )}

                            <Group gap="xs">
                                <Config.Label>
                                    {t('bigNumber.comparison.format')}
                                </Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: ComparisonFormatTypes.RAW,
                                            label: t(
                                                'bigNumber.comparison.rawValue',
                                            ),
                                        },
                                        {
                                            value: ComparisonFormatTypes.PERCENTAGE,
                                            label: t(
                                                'bigNumber.comparison.percentage',
                                            ),
                                        },
                                    ]}
                                    value={
                                        comparisonFormat ===
                                        ComparisonFormatTypes.PERCENTAGE
                                            ? ComparisonFormatTypes.PERCENTAGE
                                            : ComparisonFormatTypes.RAW
                                    }
                                    onChange={(e) => {
                                        setComparisonFormat(
                                            e as ComparisonFormatTypes,
                                        );
                                    }}
                                />
                            </Group>

                            <Switch
                                size="xs"
                                label={t(
                                    'bigNumber.comparison.flipPositiveColor',
                                )}
                                checked={flipColors}
                                onChange={() => {
                                    setFlipColors(!flipColors);
                                }}
                                labelPosition="left"
                                classNames={{
                                    label: classes.switchLabel,
                                }}
                            />

                            {showStyle &&
                                comparisonFormat ===
                                    ComparisonFormatTypes.RAW && (
                                    <Select
                                        label={t('bigNumber.comparison.style')}
                                        data={styleOptions}
                                        value={bigNumberComparisonStyle ?? ''}
                                        onChange={(newValue) => {
                                            if (!newValue) {
                                                setBigNumberComparisonStyle(
                                                    undefined,
                                                );
                                            } else {
                                                setBigNumberComparisonStyle(
                                                    newValue as CompactOrAlias,
                                                );
                                            }
                                        }}
                                    />
                                )}

                            <LabelEditor
                                label={t(
                                    'bigNumber.comparison.comparisonLabel',
                                )}
                                value={comparisonLabel ?? ''}
                                placeholder={t(
                                    'bigNumber.comparison.comparisonLabelPlaceholder',
                                )}
                                onChange={setComparisonLabel}
                                fields={granularityFields}
                            />
                        </>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};
