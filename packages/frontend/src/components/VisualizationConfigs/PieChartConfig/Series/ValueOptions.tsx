import {
    PieChartValueLabels,
    type PieChartValueLabel,
} from '@lightdash/common';
import { Box, Checkbox, Group, SegmentedControl, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { Config } from '../../common/Config';

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
            <Config.SubLabel>Value position</Config.SubLabel>
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

        <Group spacing="xs">
            <Tooltip
                variant="xs"
                position="top-start"
                disabled={valueLabel !== 'hidden'}
                label="Enable Value label to configure this option"
                withinPortal
            >
                <Box>
                    <Checkbox
                        disabled={valueLabel === 'hidden'}
                        indeterminate={isShowValueOverriden}
                        checked={showValue}
                        onChange={(newValue) =>
                            onToggleShowValue(newValue.currentTarget.checked)
                        }
                        label="Show value"
                    />
                </Box>
            </Tooltip>

            <Tooltip
                position="top-start"
                disabled={valueLabel !== 'hidden'}
                label="Enable Value label to configure this option"
                withinPortal
            >
                <div>
                    <Checkbox
                        disabled={valueLabel === 'hidden'}
                        indeterminate={isShowPercentageOverriden}
                        checked={showPercentage}
                        onChange={(newValue) =>
                            onToggleShowPercentage(
                                newValue.currentTarget.checked,
                            )
                        }
                        label="Show percentage"
                    />
                </div>
            </Tooltip>
        </Group>
    </>
);
