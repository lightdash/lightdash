import { keyGrantsModel, matchesPreset, MODEL_PRESETS } from './presets';

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

describe('MODEL_PRESETS supersession', () => {
    const allPresets = Object.values(MODEL_PRESETS).flat();
    const deprecatedPresets = allPresets.filter((preset) => preset.deprecated);

    it.each(deprecatedPresets.map((preset) => [preset.provider, preset.name]))(
        '%s %s is superseded by a current preset of the same provider',
        (provider, name) => {
            const providerPresets = allPresets.filter(
                (preset) => preset.provider === provider,
            );
            let current = providerPresets.find(
                (preset) => preset.name === name,
            );
            for (let hops = 0; hops < providerPresets.length; hops += 1) {
                if (!current?.supersededBy) break;
                const { supersededBy } = current;
                current = providerPresets.find((preset) =>
                    matchesPreset(preset, supersededBy),
                );
            }
            expect(current).toBeDefined();
            expect(current?.deprecated).toBeFalsy();
            expect(current?.supersededBy).toBeUndefined();
        },
    );
});
