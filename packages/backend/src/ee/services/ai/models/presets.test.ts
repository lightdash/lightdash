import { keyGrantsModel } from './presets';

describe('keyGrantsModel', () => {
    it('matches the exact id or a dated variant, not a longer id', () => {
        expect(keyGrantsModel(['claude-opus-4-8'], 'claude-opus-4-8')).toBe(
            true,
        );
        expect(
            keyGrantsModel(['claude-opus-4-8-20260115'], 'claude-opus-4-8'),
        ).toBe(true);
        expect(keyGrantsModel(['claude-opus-4-80'], 'claude-opus-4-8')).toBe(
            false,
        );
    });

    it('ignores a gateway vendor prefix', () => {
        expect(
            keyGrantsModel(
                ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4'],
                'claude-haiku-4-5',
            ),
        ).toBe(true);
        expect(keyGrantsModel(['anthropic/claude-haiku-4-5'], 'gpt-5.4')).toBe(
            false,
        );
    });
});
