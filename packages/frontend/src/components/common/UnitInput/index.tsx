import { Button } from '@blueprintjs/core';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { StyledNumberInput } from './UnitInput.style';

type UnitInputProps<T extends string> = {
    name: string;
    units: T[];
    value: string;
    defaultValue: string;
    onChange: (value: string | undefined) => void;
};

export const getValueAndUnit = <T extends string>(
    valueWithUnit: string,
    units: T[],
): [string?, T?] => {
    if (!valueWithUnit || valueWithUnit === '') return [];

    const unit = units.find((u) => valueWithUnit.endsWith(u)) || units[0];
    const value = valueWithUnit.replace(unit, '');
    return [value, unit];
};

const UnitInput = <T extends string>({
    name,
    units,
    value: valueWithUnit,
    defaultValue: defaultValueWithUnit,
    onChange,
}: UnitInputProps<T>) => {
    const [value, unit] = useMemo(
        () => getValueAndUnit(valueWithUnit, units),
        [valueWithUnit, units],
    );

    const [defaultValue, defaultUnit] = useMemo(
        () => getValueAndUnit(defaultValueWithUnit, units),
        [defaultValueWithUnit, units],
    );

    const nextUnit = useMemo(() => {
        if (!unit) return;

        const currentIndex = units.indexOf(unit);
        return units.concat(units[0])[currentIndex + 1];
    }, [unit, units]);

    const handleChange = useCallback(
        (newValue?: string, newUnit?: T) =>
            onChange(
                newValue && newValue !== '' && newUnit
                    ? `${newValue}${newUnit}`
                    : undefined,
            ),
        [onChange],
    );

    return (
        <StyledNumberInput
            type="number"
            id={`${name}-input`}
            name={name}
            placeholder={defaultValue}
            value={value || ''}
            onChange={(e) =>
                handleChange(e.target.value, value ? unit : defaultUnit)
            }
            rightElement={
                <Button
                    minimal
                    small
                    disabled={!value}
                    onClick={() =>
                        handleChange(value, value ? nextUnit : defaultUnit)
                    }
                >
                    {unit || defaultUnit}
                </Button>
            }
        />
    );
};

export default UnitInput;
