import type { RowLimit } from '@lightdash/common';
import {
    Group,
    NumberInput,
    SegmentedControl,
    Switch,
    Text,
} from '@mantine-8/core';
import { type FC } from 'react';

const MODE_OPTIONS = [
    { label: 'Show', value: 'show' },
    { label: 'Hide', value: 'hide' },
];

const DIRECTION_OPTIONS = [
    { label: 'First', value: 'first' },
    { label: 'Last', value: 'last' },
];

type Props = {
    rowLimit: RowLimit | undefined;
    onRowLimitChange: (rowLimit: RowLimit | undefined) => void;
};

export const RowLimitControls: FC<Props> = ({ rowLimit, onRowLimitChange }) => (
    <>
        <Switch
            label="Limit displayed rows"
            checked={rowLimit !== undefined}
            onChange={(e) =>
                onRowLimitChange(
                    e.currentTarget.checked
                        ? { mode: 'show', direction: 'first', count: 50 }
                        : undefined,
                )
            }
        />
        {rowLimit !== undefined && (
            <Group gap="xs" wrap="nowrap">
                <SegmentedControl
                    size="xs"
                    data={MODE_OPTIONS}
                    value={rowLimit.mode}
                    onChange={(value) =>
                        onRowLimitChange({
                            ...rowLimit,
                            mode: value as 'show' | 'hide',
                        })
                    }
                />
                <Text fz="xs" c="ldGray.6">
                    the
                </Text>
                <SegmentedControl
                    size="xs"
                    data={DIRECTION_OPTIONS}
                    value={rowLimit.direction}
                    onChange={(value) =>
                        onRowLimitChange({
                            ...rowLimit,
                            direction: value as 'first' | 'last',
                        })
                    }
                />
                <NumberInput
                    size="xs"
                    w={60}
                    min={1}
                    allowDecimal={false}
                    value={rowLimit.count}
                    onChange={(value) =>
                        onRowLimitChange({
                            ...rowLimit,
                            count: typeof value === 'number' ? value : 50,
                        })
                    }
                />
                <Text fz="xs" c="ldGray.6">
                    rows
                </Text>
            </Group>
        )}
    </>
);
