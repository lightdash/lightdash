import {
    NumberInput as MantineNumberInput,
    type NumberInputProps as MantineNumberInputProps,
} from '@mantine-8/core';
import { handleNumberInputChange } from '../../utils/numberInputUtils';

export type NumberInputProps = Omit<
    MantineNumberInputProps,
    'onChange' | 'decimalScale'
> & {
    /**
     * Fires with a number, or undefined when the field is cleared. Transient
     * typing states ('', '-', '12.') never fire, so half-typed values cannot
     * reach app state.
     */
    onNumberChange?: (value: number | undefined) => void;
    /**
     * Raw Mantine contract emitting `number | string`. Only for
     * form.getInputProps() spreads, where the form library owns parsing.
     */
    onChange?: MantineNumberInputProps['onChange'];
    /**
     * Maximum decimal places. Integer-only by default; pass a number for
     * decimal fields, or 'unlimited' to remove the cap entirely.
     */
    decimalScale?: number | 'unlimited';
};

/** Lightdash NumberInput. Prefer `onNumberChange` over `onChange`. */
export const NumberInput = ({
    onNumberChange,
    onChange,
    decimalScale = 0,
    ...props
}: NumberInputProps) => (
    <MantineNumberInput
        decimalScale={decimalScale === 'unlimited' ? undefined : decimalScale}
        {...props}
        onChange={
            onChange ??
            handleNumberInputChange(
                (value) => onNumberChange?.(value),
                () => onNumberChange?.(undefined),
            )
        }
    />
);
