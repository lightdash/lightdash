import { Button, TextInput, type TextInputProps } from '@mantine/core';
import { mergeRefs } from '@mantine/hooks';
import { forwardRef, useCallback, useMemo, useRef } from 'react';

export type UnitInputProps = Omit<
    TextInputProps,
    'name' | 'value' | 'defaultValue' | 'onChange'
> & {
    name: string;
    units: string[];
    value: string;
    defaultValue: string;
    fallbackValue?: string;
    onChange: (value: string | undefined) => void;
};

const getValueAndUnit = (
    valueWithUnit: string,
    units: string[],
): [string?, string?] => {
    if (!valueWithUnit || valueWithUnit === '') return [];

    const unit = units.find((u) => valueWithUnit.endsWith(u)) || units[0];
    const value = valueWithUnit.replace(unit, '');
    return [value, unit];
};

const UnitInput = forwardRef<HTMLInputElement, UnitInputProps>(
    (
        {
            name,
            units,
            value: valueWithUnit,
            defaultValue: defaultValueWithUnit,
            onChange,
            ...rest
        },
        ref,
    ) => {
        const inputRef = useRef<HTMLInputElement | null>(null);

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
            (newValue?: string, newUnit?: string, trigger: boolean = false) => {
                onChange(
                    newValue && newValue !== '' && newUnit
                        ? `${newValue}${newUnit}`
                        : defaultValue,
                );
                if (trigger) {
                    inputRef.current?.focus();
                }
            },
            [onChange, defaultValue],
        );

        const isValueDefault =
            !valueWithUnit ||
            valueWithUnit === '' ||
            valueWithUnit === defaultValue;
        const isValueNumeric = !!(value || defaultValue)?.match(/^[0-9]+$/);

        return (
            <TextInput
                ref={mergeRefs(inputRef, ref)}
                type="number"
                name={name}
                {...rest}
                placeholder={defaultValue}
                value={!isValueDefault && isValueNumeric ? value : ''}
                onChange={(e) => {
                    handleChange(e.target.value, value ? unit : defaultUnit);
                }}
                rightSectionWidth="auto"
                rightSection={
                    !defaultUnit ||
                    (isValueDefault && !isValueNumeric) ? undefined : (
                        <Button
                            size="xs"
                            px="xs"
                            mx="xxs"
                            variant="light"
                            h={rest.size === 'xs' ? 24 : 32}
                            onClick={() =>
                                handleChange(
                                    value || defaultValue,
                                    nextUnit ?? defaultUnit,
                                    true,
                                )
                            }
                        >
                            {unit ?? defaultUnit}
                        </Button>
                    )
                }
                styles={{
                    rightSection: {
                        ...(rest.size === 'xs'
                            ? { display: 'flex', alignItems: 'center' }
                            : {}),
                    },
                }}
            />
        );
    },
);

export default UnitInput;
