import {
    keyGrantsModel,
    matchesPreset,
    MODEL_PRESETS,
    type ModelPreset,
    type ModelPresetProvider,
} from './presets';

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

    // Stops after as many hops as the provider has presets, so a cycle ends on
    // a preset that still has `supersededBy` and fails the assertions below.
    const followChain = (
        providerPresets: ModelPreset<ModelPresetProvider>[],
        start: ModelPreset<ModelPresetProvider> | undefined,
    ) => {
        let current = start;
        for (let hops = 0; hops < providerPresets.length; hops += 1) {
            if (!current?.supersededBy) break;
            const target: string = current.supersededBy;
            current = providerPresets.find((preset) =>
                matchesPreset(preset, target),
            );
        }
        return current;
    };

    it.each(deprecatedPresets.map((preset) => [preset.provider, preset.name]))(
        '%s %s is superseded by a current preset of the same provider within a bounded, cycle-free chain',
        (provider, name) => {
            const providerPresets = allPresets.filter(
                (preset) => preset.provider === provider,
            );
            const start = providerPresets.find(
                (preset) => preset.name === name,
            );
            expect(start).toBeDefined();
            const end = followChain(providerPresets, start);
            expect(end).toBeDefined();
            expect(end?.deprecated).toBeFalsy();
            expect(end?.supersededBy).toBeUndefined();
        },
    );
});
