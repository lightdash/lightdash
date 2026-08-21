import { Flex, Input, Select } from '@mantine/core';
import { useId, useState, type FC } from 'react';
import { NumberInput, type NumberInputProps } from '../NumberInput';
import {
    ALL_DURATION_UNITS,
    DURATION_UNIT_LABELS,
    DURATION_UNIT_SECONDS,
    type DurationUnit,
    findExactUnit,
} from './duration';

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
 * A number input with a unit select beside it, laid out like the filter
 * "in the last N days" inputs. The value is always expressed in seconds, so
 * callers never deal with unit conversion. Switching unit keeps the typed
 * number and re-emits the converted seconds.
 */
export const DurationInput: FC<DurationInputProps> = ({
    value,
    onChange,
    units = ALL_DURATION_UNITS,
    defaultUnit,
    minSeconds,
    maxSeconds,
    disabled,
    label,
    description,
    error,
    required,
    withAsterisk,
    size,
    id,
    ...numberInputProps
}) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const fallbackUnit =
        defaultUnit && units.includes(defaultUnit)
            ? defaultUnit
            : [...units].sort(
                  (a, b) => DURATION_UNIT_SECONDS[a] - DURATION_UNIT_SECONDS[b],
              )[0];
    const [selectedUnit, setUnit] = useState<DurationUnit>(
        () =>
            (value !== null ? findExactUnit(value, units) : null) ??
            fallbackUnit,
    );
    // Keep the user's unit while it still divides the value; if the parent
    // sets a value it can't express (e.g. a form reset), re-derive it.
    const unit =
        value === null || value % DURATION_UNIT_SECONDS[selectedUnit] === 0
            ? selectedUnit
            : (findExactUnit(value, units) ?? selectedUnit);
    const multiplier = DURATION_UNIT_SECONDS[unit];
    const amount = value === null ? '' : value / multiplier;

    const toSeconds = (count: number, unitSeconds: number) =>
        Math.round(count * unitSeconds);

    return (
        <Input.Wrapper
            id={inputId}
            label={label}
            description={description}
            error={error}
            required={required}
            withAsterisk={withAsterisk}
            size={size}
        >
            <Flex gap="xs">
                <NumberInput
                    {...numberInputProps}
                    id={inputId}
                    flex="1 1 auto"
                    size={size}
                    value={amount}
                    disabled={disabled}
                    error={!!error}
                    decimalScale={2}
                    min={minSeconds === undefined ? 0 : minSeconds / multiplier}
                    max={
                        maxSeconds === undefined
                            ? undefined
                            : maxSeconds / multiplier
                    }
                    onNumberChange={(count) =>
                        onChange(
                            count === undefined
                                ? null
                                : toSeconds(count, multiplier),
                        )
                    }
                />
                <Select
                    aria-label="Duration unit"
                    w={130}
                    size={size}
                    disabled={disabled}
                    error={!!error}
                    allowDeselect={false}
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
            </Flex>
        </Input.Wrapper>
    );
};
