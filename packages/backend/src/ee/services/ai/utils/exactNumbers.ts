export type ExactNumber = { numerator: bigint; denominator: bigint };

const absolute = (value: bigint) => (value < 0n ? -value : value);

export const exactNumber = (value: unknown): ExactNumber | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (
        typeof value === 'number' &&
        (!Number.isFinite(value) ||
            (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
        return null;
    const text = String(value).trim();
    if (text.length > 120) return null;
    const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,3}))?$/i.exec(text);
    if (!match) return null;
    const fraction = match[3] ?? '';
    const exponent = Number(match[4] ?? 0) - fraction.length;
    if (Math.abs(exponent) > 100) return null;
    const numerator = BigInt(
        `${match[1] === '-' ? '-' : ''}${match[2]}${fraction}`,
    );
    return exponent >= 0
        ? { numerator: numerator * 10n ** BigInt(exponent), denominator: 1n }
        : { numerator, denominator: 10n ** BigInt(-exponent) };
};

export const subtractExact = (a: ExactNumber, b: ExactNumber): ExactNumber => ({
    numerator: a.numerator * b.denominator - b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
});

export const divideExact = (
    a: ExactNumber,
    b: ExactNumber,
): ExactNumber | null => {
    if (b.numerator === 0n) return null;
    const sign = b.numerator < 0n ? -1n : 1n;
    return {
        numerator: sign * a.numerator * b.denominator,
        denominator: a.denominator * absolute(b.numerator),
    };
};

export const scaleExact = (value: ExactNumber, scale: bigint): ExactNumber => ({
    ...value,
    numerator: value.numerator * scale,
});

export const matchesRoundedNumber = (
    actual: ExactNumber,
    stated: ExactNumber,
    precision: ExactNumber,
): boolean => {
    if (precision.numerator <= 0n) return false;
    const numerator = actual.numerator * precision.denominator;
    const denominator = actual.denominator * precision.numerator;
    const rounded =
        (2n * absolute(numerator) + denominator) / (2n * denominator);
    const signed = actual.numerator < 0n ? -rounded : rounded;
    return (
        signed * precision.numerator * stated.denominator ===
        stated.numerator * precision.denominator
    );
};

export const formatExactNumber = (value: ExactNumber, places = 6): string => {
    const scale = 10n ** BigInt(places);
    const rounded =
        (absolute(value.numerator) * scale * 2n + value.denominator) /
        (2n * value.denominator);
    const whole = rounded / scale;
    const fraction = (rounded % scale)
        .toString()
        .padStart(places, '0')
        .replace(/0+$/, '');
    return `${value.numerator < 0n && rounded !== 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
};

export const parseStatedNumber = (
    input: string,
): { value: ExactNumber; precision: ExactNumber; percent: boolean } | null => {
    const match =
        /^([+\-−]?(?:\d+(?:,\d+)*(?:\.\d+)?|\.\d+))(?:\s*(%|percent|per cent|k|m|b|t|thousand|million|billion|trillion))?$/i.exec(
            input.trim(),
        );
    if (!match) return null;
    if (
        match[1].includes(',') &&
        !/^[+\-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(match[1])
    )
        return null;
    const numeric = match[1]
        .replaceAll(',', '')
        .replace('−', '-')
        .replace(/^([+-]?)\./, (_, sign: string) => `${sign}0.`);
    const raw = exactNumber(numeric);
    if (!raw) return null;
    const places = numeric.split('.')[1]?.length ?? 0;
    const suffix = match[2]?.toLowerCase();
    const powers: Record<string, number> = {
        k: 3,
        thousand: 3,
        m: 6,
        million: 6,
        b: 9,
        billion: 9,
        t: 12,
        trillion: 12,
    };
    const multiplier = 10n ** BigInt(powers[suffix ?? ''] ?? 0);
    return {
        value: scaleExact(raw, multiplier),
        precision: {
            numerator: multiplier,
            denominator: 10n ** BigInt(places),
        },
        percent:
            suffix === '%' || suffix === 'percent' || suffix === 'per cent',
    };
};
