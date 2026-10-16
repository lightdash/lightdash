import { Compact, CompactConfigMap } from '@lightdash/common';

const bigNumberCompactOptions = [
    Compact.AUTO,
    Compact.THOUSANDS,
    Compact.MILLIONS,
    Compact.BILLIONS,
    Compact.TRILLIONS,
];

export const getStyleOptions = (noneLabel: string) => [
    { value: '', label: noneLabel },
    ...bigNumberCompactOptions.map((compact) => ({
        value: compact,
        label: CompactConfigMap[compact].label,
    })),
];

export const StyleOptions = getStyleOptions('None');
