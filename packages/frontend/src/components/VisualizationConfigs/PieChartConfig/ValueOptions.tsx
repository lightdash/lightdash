// TODO: Move to Series/ folder after refactor

import {
    PieChartValueLabels,
    type PieChartValueLabel,
} from '@lightdash/common';
import { Checkbox, Group, SegmentedControl } from '@mantine/core';
import { type FC } from 'react';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

type ValueOptionsProps = {
    isValueLabelOverriden?: boolean;
    isShowValueOverriden?: boolean;
    isShowPercentageOverriden?: boolean;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;
    valueLabelColor?: string;
    defaultValueLabelColor?: string;
    swatches?: string[];

    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    onToggleShowValue: (newValue: boolean) => void;
    onToggleShowPercentage: (newValue: boolean) => void;
    onValueLabelColorChange?: (color: string | undefined) => void;
};

export const ValueOptions: FC<ValueOptionsProps> = ({
    isValueLabelOverriden = false,
    isShowValueOverriden = false,
    isShowPercentageOverriden = false,

    valueLabel,
    showValue,
    showPercentage,
    valueLabelColor,
    defaultValueLabelColor,
    swatches = [],

    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
    onValueLabelColorChange,
}) => (
    <>
        <Group gap="xs" wrap="nowrap">
            <Config.Label>Value position</Config.Label>
            <SegmentedControl
                value={isValueLabelOverriden ? 'mixed' : valueLabel}
                data={[
                    ...(isValueLabelOverriden ? [['mixed', 'Mixed']] : []),
                    ...Object.entries(PieChartValueLabels),
                ].map(([value, label]) => ({
                    value,
                    label,
                    disabled: value === 'mixed',
                }))}
                onChange={(value: string) => {
                    onValueLabelChange(value as PieChartValueLabel);
                }}
            />
        </Group>

        {valueLabel !== 'hidden' && (
            <>
                <Group gap="xs">
                    <Checkbox
                        size="xs"
                        indeterminate={isShowValueOverriden}
                        checked={showValue}
                        onChange={(newValue) =>
                            onToggleShowValue(newValue.currentTarget.checked)
                        }
                        label="Show value"
                    />

                    <Checkbox
                        size="xs"
                        indeterminate={isShowPercentageOverriden}
                        checked={showPercentage}
                        onChange={(newValue) =>
                            onToggleShowPercentage(
                                newValue.currentTarget.checked,
                            )
                        }
                        label="Show percentage"
                    />
                </Group>

                {onValueLabelColorChange && (
                    <Group gap="xs" wrap="nowrap">
                        <Config.Label>Label color</Config.Label>
                        <ColorSelector
                            color={valueLabelColor}
                            defaultColor={defaultValueLabelColor}
                            swatches={swatches}
                            withAlpha
                            ariaLabel="Select value label color"
                            onColorChange={onValueLabelColorChange}
                            onColorReset={
                                valueLabelColor
                                    ? () => onValueLabelColorChange(undefined)
                                    : undefined
                            }
                            resetLabel="Use automatic color"
                        />
                    </Group>
                )}
            </>
        )}
    </>
);
