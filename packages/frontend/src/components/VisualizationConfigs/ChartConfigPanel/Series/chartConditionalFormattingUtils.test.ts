import {
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
} from '@lightdash/common';
import {
    getSupportedChartConditionalFormattingConfigs,
    mergeChartConditionalFormattingConfigs,
} from './chartConditionalFormattingUtils';

describe('chartConditionalFormattingUtils', () => {
    it('returns only supported single-color configs for the chart editor', () => {
        const single =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const range =
            createConditionalFormattingConfigWithColorRange('#00ff00');

        expect(
            getSupportedChartConditionalFormattingConfigs([single, range]),
        ).toEqual([single]);
    });

    it('preserves unsupported configs when updating a supported config', () => {
        const supported =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const unsupported =
            createConditionalFormattingConfigWithColorRange('#00ff00');
        const updatedSupported = {
            ...supported,
            color: '#0000ff',
        };

        expect(
            mergeChartConditionalFormattingConfigs({
                previousConfigs: [supported, unsupported],
                nextSupportedConfigs: [updatedSupported],
            }),
        ).toEqual([updatedSupported, unsupported]);
    });

    it('preserves unsupported configs when removing a supported config', () => {
        const firstSupported =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const unsupported =
            createConditionalFormattingConfigWithColorRange('#00ff00');
        const secondSupported =
            createConditionalFormattingConfigWithSingleColor('#0000ff');

        expect(
            mergeChartConditionalFormattingConfigs({
                previousConfigs: [firstSupported, unsupported, secondSupported],
                nextSupportedConfigs: [secondSupported],
            }),
        ).toEqual([secondSupported, unsupported]);
    });

    it('appends newly added supported configs without dropping unsupported configs', () => {
        const supported =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const unsupported =
            createConditionalFormattingConfigWithColorRange('#00ff00');
        const addedSupported =
            createConditionalFormattingConfigWithSingleColor('#0000ff');

        expect(
            mergeChartConditionalFormattingConfigs({
                previousConfigs: [supported, unsupported],
                nextSupportedConfigs: [supported, addedSupported],
            }),
        ).toEqual([supported, unsupported, addedSupported]);
    });
});
