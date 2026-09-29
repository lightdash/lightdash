export type VizGradientValue = {
    colors: string[];
    min: number | 'auto';
    max: number | 'auto';
};

const isBound = (value: unknown): value is number | 'auto' =>
    value === 'auto' || (typeof value === 'number' && Number.isFinite(value));

export const isVizGradientValue = (
    value: unknown,
): value is VizGradientValue => {
    if (typeof value !== 'object' || value === null) return false;
    return (
        'colors' in value &&
        Array.isArray(value.colors) &&
        value.colors.length >= 2 &&
        value.colors.length <= 5 &&
        value.colors.every(
            (color: unknown) =>
                typeof color === 'string' &&
                /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color),
        ) &&
        'min' in value &&
        isBound(value.min) &&
        'max' in value &&
        isBound(value.max)
    );
};
