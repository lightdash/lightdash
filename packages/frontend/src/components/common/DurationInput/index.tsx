import { Select } from '@mantine/core';
import { useState, type FC } from 'react';
import { NumberInput, type NumberInputProps } from '../NumberInput';
import {
    ALL_DURATION_UNITS,
    DURATION_UNIT_LABELS,
    DURATION_UNIT_SECONDS,
    type DurationUnit,
    findExactUnit,
} from './duration';
import styles from './DurationInput.module.css';

export type DurationInputProps = Omit<
    NumberInputProps,
    | 'value'
    | 'onChange'
    | 'onNumberChange'
    | 'min'
    | 'max'
    | 'rightSection'
    | 'rightSectionWidth'
    | 'rightSectionPointerEvents'
    | 'decimalScale'
> & {
    /** Duration in seconds. `null` renders an empty field. */
    value: number | null;
    /** Fires with whole seconds, or `null` when the field is cleared. */
    onChange: (seconds: number | null) => void;
    /** Units offered in the selector. Defaults to all four. */
    units?: DurationUnit[];
    /**
     * Unit shown when the value is empty or not a whole number of any
     * allowed unit. Defaults to the smallest allowed unit.
     */
    defaultUnit?: DurationUnit;
    minSeconds?: number;
    maxSeconds?: number;
};

/**
 * A number input with a unit selector in its right section. The value is
 * always expressed in seconds, so callers never deal with unit conversion.
 * Switching unit keeps the typed number and re-emits the converted seconds.
 */
export const DurationInput: FC<DurationInputProps> = ({
    value,
    onChange,
    units = ALL_DURATION_UNITS,
    defaultUnit,
    minSeconds,
    maxSeconds,
    disabled,
    ...numberInputProps
}) => {
    const fallbackUnit =
        defaultUnit && units.includes(defaultUnit)
            ? defaultUnit
            : [...units].sort(
                  (a, b) => DURATION_UNIT_SECONDS[a] - DURATION_UNIT_SECONDS[b],
              )[0];
    const [unit, setUnit] = useState<DurationUnit>(
        () =>
            (value !== null ? findExactUnit(value, units) : null) ??
            fallbackUnit,
    );
    const multiplier = DURATION_UNIT_SECONDS[unit];
    const amount = value === null ? '' : value / multiplier;

    const toSeconds = (count: number, unitSeconds: number) =>
        Math.round(count * unitSeconds);

    return (
        <NumberInput
            {...numberInputProps}
            value={amount}
            disabled={disabled}
            decimalScale={2}
            min={minSeconds === undefined ? 0 : minSeconds / multiplier}
            max={maxSeconds === undefined ? undefined : maxSeconds / multiplier}
            onNumberChange={(count) =>
                onChange(
                    count === undefined ? null : toSeconds(count, multiplier),
                )
            }
            rightSectionWidth={108}
            rightSectionPointerEvents="all"
            rightSection={
                <Select
                    aria-label="Duration unit"
                    variant="unstyled"
                    size={numberInputProps.size}
                    w="100%"
                    disabled={disabled}
                    allowDeselect={false}
                    rightSectionWidth={28}
                    comboboxProps={{
                        width: 'target',
                        position: 'bottom-end',
                        withinPortal: true,
                    }}
                    classNames={{
                        wrapper: styles.unitSelect,
                        input: styles.unitInput,
                        dropdown: styles.unitDropdown,
                    }}
                    data={units.map((candidate) => ({
                        value: candidate,
                        label: DURATION_UNIT_LABELS[candidate],
                    }))}
                    value={unit}
                    onChange={(next) => {
                        const nextUnit = units.find((u) => u === next);
                        if (!nextUnit) return;
                        setUnit(nextUnit);
                        if (typeof amount === 'number') {
                            onChange(
                                toSeconds(
                                    amount,
                                    DURATION_UNIT_SECONDS[nextUnit],
                                ),
                            );
                        }
                    }}
                />
            }
        />
    );
};
