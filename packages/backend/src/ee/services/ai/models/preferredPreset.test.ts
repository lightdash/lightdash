import { SEMANTIC_STUDIO_MODEL_TIERS } from '../../SemanticStudioService/modelPreference';
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
        findPreferredPreset(everything, provider, SEMANTIC_STUDIO_MODEL_TIERS);

    it('prefers the tier Semantic Studio asks for on each provider it has a view on', () => {
        expect(prefer('anthropic')?.tier).toBe('frontier');
        expect(prefer('bedrock')?.tier).toBe('frontier');
        expect(prefer('openai')?.tier).toBe('balanced');
    });

    it('never prefers a deprecated preset', () => {
        ['anthropic', 'bedrock', 'openai'].forEach((provider) =>
            expect(prefer(provider)?.deprecated).not.toBe(true),
        );
    });

    it('takes the first preset of a tier, which is the latest', () => {
        const [older] = MODEL_PRESETS.openai.filter(
            ({ tier }) => tier === 'balanced',
        );
        const newer = { ...older, name: 'a-newer-balanced-model' };
        expect(
            findPreferredPreset(
                catalogueOf([newer, older]),
                'openai',
                SEMANTIC_STUDIO_MODEL_TIERS,
            )?.name,
        ).toBe('a-newer-balanced-model');
    });

    it('has no preference for a provider without one, or when the org is not offered the preset', () => {
        expect(prefer('google')).toBeNull();
        expect(prefer('a-custom-provider')).toBeNull();
        expect(
            findPreferredPreset(
                catalogueOf(MODEL_PRESETS.google),
                'anthropic',
                SEMANTIC_STUDIO_MODEL_TIERS,
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
