import { Compact, CompactConfigMap } from '@lightdash/common';

const bigNumberCompactOptions = [
    Compact.AUTO,
    Compact.THOUSANDS,
    Compact.MILLIONS,
    Compact.BILLIONS,
    Compact.TRILLIONS,
];

export const StyleOptions = [
    { value: '', label: 'None' },
    ...bigNumberCompactOptions.map((compact) => ({
        value: compact,
        label: CompactConfigMap[compact].label,
    })),
];
