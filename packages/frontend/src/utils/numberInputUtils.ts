/**
 * Mantine 8 NumberInput emits `number | string` from onChange: strings are
 * incomplete typing states ('', '-', '12.') or values beyond the safe integer
 * range. These helpers keep those transients out of app state.
 */

/** Maps a NumberInput value to a number, or undefined for anything non-numeric. */
export const optionalNumber = (value: number | string): number | undefined =>
    typeof value === 'number' ? value : undefined;

/**
 * Builds a NumberInput onChange handler that only propagates real numbers.
 * `onClear` fires when the field is emptied; other transient strings are
 * ignored so half-typed values never reach app state.
 */
export const handleNumberInputChange =
    (onNumber: (value: number) => void, onClear?: () => void) =>
    (value: number | string): void => {
        if (typeof value === 'number') {
            onNumber(value);
        } else if (value === '') {
            onClear?.();
        }
    };
