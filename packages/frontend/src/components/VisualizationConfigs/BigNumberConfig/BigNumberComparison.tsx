import {
    ComparisonFormatTypes,
    getItemId,
    type CompactOrAlias,
} from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
} from '@mantine-8/core';
import { useEffect, useRef, useState } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isBigNumberVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import classes from './BigNumberComparison.module.css';
import { StyleOptions } from './common';

type CompareTarget = 'previous_row' | 'another_field';

export const Comparison: React.FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

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
                        <Config.Heading>Show comparison</Config.Heading>
                        <Switch
                            checked={showComparison}
                            onChange={() => {
                                setShowComparison(!showComparison);
                            }}
                        />
                    </Group>

                    {showComparison ? (
                        <>
                            <Group gap="xs">
                                <Config.Label>Compare to</Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: 'previous_row' as CompareTarget,
                                            label: 'Previous row',
                                        },
                                        {
                                            value: 'another_field' as CompareTarget,
                                            label: 'Same row',
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
                                    label="Field"
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
                                <Config.Label>Format</Config.Label>
                                <SegmentedControl
                                    data={[
                                        {
                                            value: ComparisonFormatTypes.RAW,
                                            label: 'Raw value',
                                        },
                                        {
                                            value: ComparisonFormatTypes.PERCENTAGE,
                                            label: 'Percentage',
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
                                label="Flip positive color"
                                checked={flipColors}
                                onChange={() => {
                                    setFlipColors(!flipColors);
                                }}
                                labelPosition="left"
                                classNames={{ label: classes.switchLabel }}
                            />

                            {showStyle &&
                                comparisonFormat ===
                                    ComparisonFormatTypes.RAW && (
                                    <Select
                                        label="Style"
                                        data={StyleOptions}
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

                            <TextInput
                                label="Comparison label"
                                value={comparisonLabel ?? ''}
                                placeholder={'Add an optional label'}
                                onChange={(e) =>
                                    setComparisonLabel(e.currentTarget.value)
                                }
                            />
                        </>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};
