import {
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithSingleColor,
} from '@lightdash/common';

export const getSupportedChartConditionalFormattingConfigs = (
    conditionalFormattings: ConditionalFormattingConfig[],
): ConditionalFormattingConfigWithSingleColor[] =>
    conditionalFormattings.filter(isConditionalFormattingConfigWithSingleColor);

export const mergeChartConditionalFormattingConfigs = ({
    previousConfigs,
    nextSupportedConfigs,
}: {
    previousConfigs: ConditionalFormattingConfig[];
    nextSupportedConfigs: ConditionalFormattingConfigWithSingleColor[];
}): ConditionalFormattingConfig[] => {
    let nextSupportedIndex = 0;

    const mergedConfigs = previousConfigs.reduce<ConditionalFormattingConfig[]>(
        (acc, config) => {
            if (!isConditionalFormattingConfigWithSingleColor(config)) {
                acc.push(config);
                return acc;
            }

            const nextConfig = nextSupportedConfigs[nextSupportedIndex];
            nextSupportedIndex += 1;

            if (nextConfig) {
                acc.push(nextConfig);
            }

            return acc;
        },
        [],
    );

    return mergedConfigs.concat(nextSupportedConfigs.slice(nextSupportedIndex));
};
