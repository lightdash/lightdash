import {
    FilterType,
    UnitOfTime,
    type DashboardFilterBoundary,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Group,
    Select,
    Stack,
    Switch,
    TextInput,
    Text,
} from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC } from 'react';
import FilterMultiStringInput from '../../../components/common/Filters/FilterInputs/FilterMultiStringInput';
import FilterUnitOfTimeAutoComplete from '../../../components/common/Filters/FilterInputs/FilterUnitOfTimeAutoComplete';
import MantineIcon from '../../../components/common/MantineIcon';
import { NumberInput } from '../../../components/common/NumberInput';
import classes from '../FilterRequirements/RequiredFilterCard.module.css';
import FilterBoundaryStringValues from './FilterBoundaryStringValues';

const initialBoundary = (type: FilterType): DashboardFilterBoundary => {
    if (type === FilterType.NUMBER) return { type: 'number', min: 0, max: 100 };
    if (type === FilterType.STRING) return { type: 'string', values: [] };
    return {
        type: 'date',
        mode: 'relative',
        value: 12,
        unitOfTime: UnitOfTime.months,
        completed: false,
    };
};

const FilterBoundaryEditor: FC<{
    filterType: FilterType;
    field: DashboardFilterableField | undefined;
    filterRule: DashboardFilterRule;
    value: DashboardFilterBoundary | undefined;
    onChange: (value: DashboardFilterBoundary | undefined) => void;
}> = ({ filterType, field, filterRule, value, onChange }) => {
    if (filterType === FilterType.BOOLEAN) return null;
    return (
        <Box className={clsx(classes.card, !!value && classes.cardActive)}>
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={IconAdjustmentsHorizontal}
                        size="sm"
                        color={value ? 'yellow.7' : 'ldGray.6'}
                    />
                    <Text size="xs" fw={600}>
                        Filter boundaries
                    </Text>
                </Group>
                <Switch
                    size="xs"
                    color="yellow.6"
                    aria-label="Filter boundaries"
                    checked={!!value}
                    onChange={(event) =>
                        onChange(
                            event.currentTarget.checked
                                ? initialBoundary(filterType)
                                : undefined,
                        )
                    }
                />
            </Group>
            {value && (
                <Stack gap="xs" mt="xs">
                    <Text size="xs" c="ldGray.7">
                        Limit the values dashboard viewers can select.
                    </Text>
                    {value?.type === 'string' &&
                        (field ? (
                            <FilterBoundaryStringValues
                                field={field}
                                filterRule={filterRule}
                                values={value.values}
                                onChange={(values) =>
                                    onChange({ ...value, values })
                                }
                            />
                        ) : (
                            <FilterMultiStringInput
                                preserveWhitespace
                                values={value.values}
                                placeholder="Add permitted values"
                                onChange={(values) =>
                                    onChange({ ...value, values })
                                }
                                comboboxProps={{ withinPortal: false }}
                            />
                        ))}
                    {value?.type === 'number' && (
                        <Group grow align="start">
                            <NumberInput
                                size="xs"
                                label="Minimum (inclusive)"
                                decimalScale="unlimited"
                                value={value.min}
                                onNumberChange={(min) =>
                                    onChange({ ...value, min: min ?? NaN })
                                }
                            />
                            <NumberInput
                                size="xs"
                                label="Maximum (inclusive)"
                                decimalScale="unlimited"
                                value={value.max}
                                onNumberChange={(max) =>
                                    onChange({ ...value, max: max ?? NaN })
                                }
                            />
                        </Group>
                    )}
                    {value?.type === 'date' && (
                        <>
                            <Select
                                size="xs"
                                label="Date window"
                                allowDeselect={false}
                                value={value.mode}
                                data={[
                                    {
                                        value: 'relative',
                                        label: 'In the last',
                                    },
                                    {
                                        value: 'fixed',
                                        label: 'Fixed date range',
                                    },
                                ]}
                                comboboxProps={{ withinPortal: false }}
                                onChange={(mode) =>
                                    onChange(
                                        mode === 'fixed'
                                            ? {
                                                  type: 'date',
                                                  mode: 'fixed',
                                                  start: '',
                                                  end: '',
                                              }
                                            : initialBoundary(FilterType.DATE),
                                    )
                                }
                            />
                            {value.mode === 'relative' ? (
                                <Group grow align="start">
                                    <NumberInput
                                        size="xs"
                                        aria-label="Number of periods"
                                        min={1}
                                        value={value.value}
                                        onNumberChange={(count) =>
                                            onChange({
                                                ...value,
                                                value: count ?? 0,
                                            })
                                        }
                                    />
                                    <FilterUnitOfTimeAutoComplete
                                        isTimestamp={false}
                                        unitOfTime={value.unitOfTime}
                                        completed={value.completed}
                                        onChange={(settings) =>
                                            onChange({
                                                ...value,
                                                ...settings,
                                            })
                                        }
                                        comboboxProps={{
                                            withinPortal: false,
                                        }}
                                    />
                                </Group>
                            ) : (
                                <Group grow align="start">
                                    <TextInput
                                        size="xs"
                                        type="date"
                                        label="First date (inclusive)"
                                        value={value.start}
                                        onChange={(event) =>
                                            onChange({
                                                ...value,
                                                start: event.currentTarget
                                                    .value,
                                            })
                                        }
                                    />
                                    <TextInput
                                        size="xs"
                                        type="date"
                                        label="Last date (inclusive)"
                                        value={value.end}
                                        onChange={(event) =>
                                            onChange({
                                                ...value,
                                                end: event.currentTarget.value,
                                            })
                                        }
                                    />
                                </Group>
                            )}
                        </>
                    )}
                </Stack>
            )}
        </Box>
    );
};
export default FilterBoundaryEditor;
