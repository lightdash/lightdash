import { type TFunction } from 'i18next';

export const CUSTOM_WIDTH_OPTIONS = [
    {
        label: 'Tablet (1000px)',
        value: '1000',
    },
    {
        label: 'Laptop Screen (1400px)',
        value: '1400',
    },
    {
        label: 'External Monitor (1500px)',
        value: '1500',
    },
    {
        label: 'TV Screen (1600px)',
        value: '1600',
    },
    {
        label: 'Large Monitor (1920px)',
        value: '1920',
    },
    {
        label: 'Ultra-wide Monitor (2560px)',
        value: '2560',
    },
];

const CUSTOM_WIDTH_LABEL_KEYS: Record<string, string> = {
    '1000': 'customWidth.tablet',
    '1400': 'customWidth.laptop',
    '1500': 'customWidth.externalMonitor',
    '1600': 'customWidth.tv',
    '1920': 'customWidth.largeMonitor',
    '2560': 'customWidth.ultraWide',
};

export const getCustomWidthOptions = (t: TFunction) =>
    CUSTOM_WIDTH_OPTIONS.map((option) => ({
        value: option.value,
        label: t(CUSTOM_WIDTH_LABEL_KEYS[option.value], {
            ns: 'scheduler',
            width: option.value,
        }),
    }));
