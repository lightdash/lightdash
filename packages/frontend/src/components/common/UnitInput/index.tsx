import { Button } from '@blueprintjs/core';
import { FC } from 'react';
import { StyledNumberInput } from './UnitInput.style';

type UnitInputProps<T> = {
    name: string;
    unit: T;
    units: T[];
    value: string;
    nextUnit: T;
    placeholder?: string;
    placeholderUnit?: T;
    onChange: (value: string, unit?: T) => void;
    onUnitChange: (unit?: T) => void;
};

const UnitInput = <T,>({
    name,
    value,
    units,
    unit,
    nextUnit,
    placeholder,
    placeholderUnit,
    onChange,
    onUnitChange,
}: UnitInputProps<T>) => {
    return (
        <StyledNumberInput
            type="number"
            id={`${name}-input`}
            name={name}
            placeholder={placeholder}
            value={value || ''}
            onChange={(e) =>
                onChange(e.target.value, value ? unit : placeholderUnit)
            }
            rightElement={
                <Button
                    minimal
                    small
                    disabled={!value}
                    onClick={() =>
                        onUnitChange(value ? nextUnit : placeholderUnit)
                    }
                >
                    {unit || placeholderUnit}
                </Button>
            }
        />
    );
};

export default UnitInput;
