// TODO: Move to Series/ folder after refactor

import {
    PieChartValueLabels,
    type PieChartValueLabel,
} from '@lightdash/common';
import { Checkbox, Group, SegmentedControl } from '@mantine/core';
import { type FC } from 'react';
import { Config } from '../common/Config';

type ValueOptionsProps = {
    isValueLabelOverriden?: boolean;
    isShowValueOverriden?: boolean;
    isShowPercentageOverriden?: boolean;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;

    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    onToggleShowValue: (newValue: boolean) => void;
    onToggleShowPercentage: (newValue: boolean) => void;
};

export const ValueOptions: FC<ValueOptionsProps> = ({
    isValueLabelOverriden = false,
    isShowValueOverriden = false,
    isShowPercentageOverriden = false,

    valueLabel,
    showValue,
    showPercentage,

    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
}) => (
    <>
        <Group spacing="xs" noWrap>
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
                onChange={(newValueLabel: PieChartValueLabel) => {
                    onValueLabelChange(newValueLabel);
                }}
            />
        </Group>

        {valueLabel !== 'hidden' && (
            <Group spacing="xs">
                <Checkbox
                    indeterminate={isShowValueOverriden}
                    checked={showValue}
                    onChange={(newValue) =>
                        onToggleShowValue(newValue.currentTarget.checked)
                    }
                    label="Show value"
                />

                <Checkbox
                    indeterminate={isShowPercentageOverriden}
                    checked={showPercentage}
                    onChange={(newValue) =>
                        onToggleShowPercentage(newValue.currentTarget.checked)
                    }
                    label="Show percentage"
                />
            </Group>
        )}
    </>
);
