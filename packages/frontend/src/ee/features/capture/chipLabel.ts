/** A mark's number as shown on chips: ① to ⑳, then plain digits. */
export const chipLabel = (number: number): string =>
    number >= 1 && number <= 20
        ? String.fromCodePoint(0x2460 + number - 1)
        : `${number}`;
