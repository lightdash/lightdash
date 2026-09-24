import { type DataAppVizColorGradient } from '@lightdash/common';
import { Group, Select, Stack, Switch, Text } from '@mantine/core';
import { type FC } from 'react';
import { NumberInput } from '../../common/NumberInput';
import { Config } from '../common/Config';
import DataAppVizOptionControl from './DataAppVizOptionControl';

type Props = {
    value: DataAppVizColorGradient;
    colorPalette: string[];
    onChange: (patch: Partial<DataAppVizColorGradient>) => void;
};

/** The declared gradient stays a complete value; each control updates one part. */
const DataAppVizGradientControl: FC<Props> = ({
    value,
    colorPalette,
    onChange,
}) => (
    <Stack gap="xs">
        <Config.Group>
            <Config.Label>Use gradient</Config.Label>
            <Switch
                size="xs"
                aria-label="Use gradient"
                checked={value.enabled}
                onChange={(event) =>
                    onChange({ enabled: event.currentTarget.checked })
                }
            />
        </Config.Group>
        {value.enabled && (
            <>
                <DataAppVizOptionControl
                    option={{
                        type: 'color',
                        name: 'gradientStart',
                        label: 'Gradient start',
                        default: value.start,
                    }}
                    value={value.start}
                    colorPalette={colorPalette}
                    onChange={(next) => {
                        if (typeof next === 'string') onChange({ start: next });
                    }}
                />
                <DataAppVizOptionControl
                    option={{
                        type: 'color',
                        name: 'gradientEnd',
                        label: 'Gradient end',
                        default: value.end,
                    }}
                    value={value.end}
                    colorPalette={colorPalette}
                    onChange={(next) => {
                        if (typeof next === 'string') onChange({ end: next });
                    }}
                />
                <Group grow align="flex-start" gap="xs">
                    <Stack gap="xs">
                        <Select
                            size="xs"
                            label="Minimum"
                            data={[
                                { value: 'auto', label: 'Auto' },
                                { value: 'custom', label: 'Custom' },
                            ]}
                            value={value.min === 'auto' ? 'auto' : 'custom'}
                            allowDeselect={false}
                            onChange={(next) =>
                                onChange({
                                    min: next === 'custom' ? 0 : 'auto',
                                })
                            }
                        />
                        {value.min !== 'auto' && (
                            <NumberInput
                                size="xs"
                                label="Minimum value"
                                decimalScale="unlimited"
                                value={value.min}
                                onNumberChange={(next) =>
                                    onChange({ min: next ?? 'auto' })
                                }
                            />
                        )}
                    </Stack>
                    <Stack gap="xs">
                        <Select
                            size="xs"
                            label="Maximum"
                            data={[
                                { value: 'auto', label: 'Auto' },
                                { value: 'custom', label: 'Custom' },
                            ]}
                            value={value.max === 'auto' ? 'auto' : 'custom'}
                            allowDeselect={false}
                            onChange={(next) =>
                                onChange({
                                    max: next === 'custom' ? 1 : 'auto',
                                })
                            }
                        />
                        {value.max !== 'auto' && (
                            <NumberInput
                                size="xs"
                                label="Maximum value"
                                decimalScale="unlimited"
                                value={value.max}
                                onNumberChange={(next) =>
                                    onChange({ max: next ?? 'auto' })
                                }
                            />
                        )}
                    </Stack>
                </Group>
                {value.min !== 'auto' &&
                    value.max !== 'auto' &&
                    value.min > value.max && (
                        <Text size="xs" c="red" role="alert">
                            Minimum must be less than or equal to maximum.
                        </Text>
                    )}
            </>
        )}
    </Stack>
);

export default DataAppVizGradientControl;
