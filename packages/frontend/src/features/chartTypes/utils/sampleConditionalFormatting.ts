import {
    createConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingConfig,
} from '@lightdash/common';

// Builder previews have no saved rules, so show an automatic colour range.
export const getSampleConditionalFormattings = (
    color: string,
): ConditionalFormattingConfig[] => [
    {
        ...createConditionalFormattingConfigWithColorRange(color),
        rule: { min: 'auto', max: 'auto' },
    },
];
