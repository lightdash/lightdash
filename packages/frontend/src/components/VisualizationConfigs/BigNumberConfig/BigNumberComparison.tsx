import {
    ComparisonFormatTypes,
    getItemId,
    type CompactOrAlias,
} from '@lightdash/common';
import { Group, SegmentedControl, Select, Stack, Switch } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import {
    selectBigNumberComparisonFieldItem,
    selectBigNumberEditor,
    selectBigNumberGranularityFields,
    selectBigNumberSelectedField,
    selectBigNumberShowStyle,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useBigNumberEditorActions } from '../../../hooks/useBigNumberConfig';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { LabelEditor } from '../common/LabelEditor';
import classes from './BigNumberComparison.module.css';
import { StyleOptions } from './common';

type CompareTarget = 'previous_row' | 'another_field';

export const Comparison: React.FC = () => {
    const { itemsMap } = useVisualizationInputs();
    const bigNumberComparisonStyle = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).bigNumberComparisonStyle,
    );
    const showComparison = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).showComparison,
    );
    const comparisonFormat = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).comparisonFormat,
    );
    const flipColors = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).flipColors,
    );
    const comparisonLabel = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).comparisonLabel,
    );
    const comparisonField = useVisualizationSelector(
        (state) => selectBigNumberEditor(state).comparisonField,
    );
    const selectedField = useVisualizationInputSelector(
        selectBigNumberSelectedField,
    );
    const comparisonFieldItem = useVisualizationInputSelector(
        selectBigNumberComparisonFieldItem,
    );
    const showStyle = useVisualizationInputSelector(selectBigNumberShowStyle);
    const granularityFields = useVisualizationInputSelector(
        selectBigNumberGranularityFields,
    );
    const {
        setBigNumberComparisonStyle,
        toggleShowComparison,
        setComparisonFormat,
        toggleFlipColors,
        setComparisonLabel,
        setComparisonField,
    } = useBigNumberEditorActions();

    const rememberedField = useRef(comparisonField);

    const [compareTarget, setCompareTarget] = useState<CompareTarget>(
        comparisonField !== undefined ? 'another_field' : 'previous_row',
    );

    useEffect(() => {
        setCompareTarget(
            comparisonField !== undefined ? 'another_field' : 'previous_row',
        );
    }, [comparisonField]);

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
                            size="xs"
                            checked={showComparison}
                            onChange={toggleShowComparison}
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
                                size="xs"
                                label="Flip positive color"
                                checked={flipColors}
                                onChange={toggleFlipColors}
                                labelPosition="left"
                                classNames={{
                                    label: classes.switchLabel,
                                }}
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

                            <LabelEditor
                                label="Comparison label"
                                value={comparisonLabel ?? ''}
                                placeholder="Add an optional label"
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
