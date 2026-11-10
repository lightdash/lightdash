import { FAST_MODELS } from '.';
import {
    DEFAULT_ANTHROPIC_MODEL_NAME,
    DEFAULT_BEDROCK_MODEL_NAME,
    DEFAULT_GOOGLE_MODEL_NAME,
    DEFAULT_OPENAI_MODEL_NAME,
    DEFAULT_OPENROUTER_MODEL_NAME,
    DEFAULT_VERTEX_MODEL_NAME,
} from '../../../../config/aiConfigSchema';
import {
    getModelPreset,
    keyGrantsModel,
    matchesPreset,
    MODEL_PRESETS,
    openRouterPreset,
    vertexPreset,
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

describe('MODEL_PRESETS current models', () => {
    // Known gaps awaiting a product call; drop an entry once its data is fixed.
    const PENDING = new Set([
        'bedrock DEFAULT_BEDROCK_MODEL_NAME',
        'openrouter DEFAULT_OPENROUTER_MODEL_NAME',
        'anthropic haiku',
        'bedrock haiku',
        'bedrock opus',
    ]);
    const test = (key: string) => (PENDING.has(key) ? it.fails : it);
    const providers = Object.keys(MODEL_PRESETS) as ModelPresetProvider[];

    const configured: [ModelPresetProvider, string, string][] = [
        ['openai', 'DEFAULT_OPENAI_MODEL_NAME', DEFAULT_OPENAI_MODEL_NAME],
        [
            'anthropic',
            'DEFAULT_ANTHROPIC_MODEL_NAME',
            DEFAULT_ANTHROPIC_MODEL_NAME,
        ],
        ['google', 'DEFAULT_GOOGLE_MODEL_NAME', DEFAULT_GOOGLE_MODEL_NAME],
        ['bedrock', 'DEFAULT_BEDROCK_MODEL_NAME', DEFAULT_BEDROCK_MODEL_NAME],
        ...providers.map((provider): [ModelPresetProvider, string, string] => [
            provider,
            `FAST_MODELS.${provider}`,
            FAST_MODELS[provider],
        ]),
    ];

    configured.forEach(([provider, label, name]) => {
        test(`${provider} ${label}`)(
            `${provider} ${label} (${name}) resolves to a non-deprecated preset`,
            () => {
                const preset = getModelPreset(provider, name);
                expect(preset).not.toBeNull();
                expect(preset?.deprecated).toBeFalsy();
            },
        );
    });

    test('vertex DEFAULT_VERTEX_MODEL_NAME')(
        'DEFAULT_VERTEX_MODEL_NAME resolves to a known Vertex model',
        () => {
            expect(vertexPreset(DEFAULT_VERTEX_MODEL_NAME).custom).toBe(false);
        },
    );

    test('openrouter DEFAULT_OPENROUTER_MODEL_NAME')(
        'DEFAULT_OPENROUTER_MODEL_NAME resolves to a known OpenRouter model',
        () => {
            expect(openRouterPreset(DEFAULT_OPENROUTER_MODEL_NAME).custom).toBe(
                false,
            );
        },
    );

    providers.forEach((provider) => {
        (['haiku', 'sonnet', 'opus'] as const).forEach((family) => {
            const familyPresets = MODEL_PRESETS[provider].filter((preset) =>
                preset.name.startsWith(`claude-${family}-`),
            );
            if (familyPresets.length === 0) return;
            test(`${provider} ${family}`)(
                `${provider} offers at most one non-deprecated Claude ${family} preset`,
                () => {
                    const current = familyPresets
                        .filter((preset) => !preset.deprecated)
                        .map((preset) => preset.name);
                    // Asserting on the list names the extra presets on failure.
                    expect(current.slice(1)).toEqual([]);
                },
            );
        });
    });
});
