import { SEMANTIC_STUDIO_MODEL_TIER } from '../../SemanticStudioService/modelPreference';
import { findPreferredPreset, getOrgModelCatalogue } from './index';
import { MODEL_PRESETS } from './presets';

const catalogueOf = (
    presets: Parameters<typeof getOrgModelCatalogue>[0],
): ReturnType<typeof getOrgModelCatalogue> => ({
    instancePresets: presets,
    offeredPresets: presets,
});

describe('findPreferredPreset', () => {
    const everything = catalogueOf([
        ...MODEL_PRESETS.openai,
        ...MODEL_PRESETS.anthropic,
        ...MODEL_PRESETS.bedrock,
        ...MODEL_PRESETS.google,
    ]);
    const prefer = (provider: string) =>
        findPreferredPreset(everything, provider, SEMANTIC_STUDIO_MODEL_TIER);

    it('prefers the frontier preset of each provider that has one', () => {
        expect(prefer('anthropic')?.name).toBe('claude-opus-5-5');
        expect(prefer('bedrock')?.name).toBe('claude-opus-5-5');
        expect(prefer('openai')?.name).toBe('gpt-6.1-sol');
    });

    it('never prefers a deprecated preset', () => {
        ['anthropic', 'bedrock', 'openai'].forEach((provider) =>
            expect(prefer(provider)?.deprecated).not.toBe(true),
        );
    });

    it('takes the first preset of a tier, which is the latest', () => {
        const [older] = MODEL_PRESETS.openai.filter(
            ({ tier }) => tier === 'frontier',
        );
        const newer = { ...older, name: 'a-newer-frontier-model' };
        expect(
            findPreferredPreset(
                catalogueOf([newer, older]),
                'openai',
                SEMANTIC_STUDIO_MODEL_TIER,
            )?.name,
        ).toBe('a-newer-frontier-model');
    });

    it('has no preference for a provider without one, or when the org is not offered the preset', () => {
        expect(prefer('google')).toBeNull();
        expect(prefer('a-custom-provider')).toBeNull();
        expect(
            findPreferredPreset(
                catalogueOf(MODEL_PRESETS.google),
                'anthropic',
                SEMANTIC_STUDIO_MODEL_TIER,
            ),
        ).toBeNull();
    });

    it('only tiers presets that are not deprecated', () => {
        Object.values(MODEL_PRESETS)
            .flat()
            .filter(({ deprecated }) => deprecated)
            .forEach(({ tier }) => expect(tier).toBeUndefined());
    });
});
