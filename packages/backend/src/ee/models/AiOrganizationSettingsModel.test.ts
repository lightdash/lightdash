import { ParameterError } from '@lightdash/common';
import { applyProviderApiKeyUpdates } from './AiOrganizationSettingsModel';

describe('applyProviderApiKeyUpdates', () => {
    it('sets a new key and trims whitespace', () => {
        expect(
            applyProviderApiKeyUpdates({}, { anthropic: '  sk-ant-123  ' }),
        ).toEqual({ anthropic: 'sk-ant-123' });
    });

    it('leaves absent providers unchanged', () => {
        expect(
            applyProviderApiKeyUpdates(
                { anthropic: 'sk-ant-old', openai: 'sk-old' },
                { openai: 'sk-new' },
            ),
        ).toEqual({ anthropic: 'sk-ant-old', openai: 'sk-new' });
    });

    it('removes a key on null', () => {
        expect(
            applyProviderApiKeyUpdates(
                { anthropic: 'sk-ant-old', openai: 'sk-old' },
                { anthropic: null },
            ),
        ).toEqual({ openai: 'sk-old' });
    });

    it('throws ParameterError on empty key', () => {
        expect(() => applyProviderApiKeyUpdates({}, { openai: '   ' })).toThrow(
            ParameterError,
        );
    });
});
