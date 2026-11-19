import { findSemanticStudioPreset } from '../../SemanticStudioService/modelPreference';
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
        findPreferredPreset(everything, provider, 'frontier');

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
                'frontier',
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
                'frontier',
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

describe('findSemanticStudioPreset', () => {
    const offered = (...providers: (keyof typeof MODEL_PRESETS)[]) =>
        catalogueOf(
            providers.flatMap(
                (provider): Parameters<typeof catalogueOf>[0] =>
                    MODEL_PRESETS[provider],
            ),
        );

    it('runs on the balanced Claude model the org is offered, whatever provider is in use', () => {
        const preset = findSemanticStudioPreset(
            offered('openai', 'anthropic'),
            'openai',
        );
        expect(preset).toMatchObject({
            provider: 'anthropic',
            name: 'claude-sonnet-5-5',
        });
    });

    it('takes the strongest Claude model when the balanced one is not offered', () => {
        const withoutSonnet = catalogueOf([
            ...MODEL_PRESETS.openai,
            ...MODEL_PRESETS.anthropic.filter(
                ({ tier }) => tier !== 'balanced',
            ),
        ]);
        expect(findSemanticStudioPreset(withoutSonnet, 'openai')?.name).toBe(
            'claude-opus-5-5',
        );
    });

    it('keeps an org on Bedrock on Bedrock', () => {
        expect(
            findSemanticStudioPreset(offered('anthropic', 'bedrock'), 'bedrock')
                ?.provider,
        ).toBe('bedrock');
    });

    it('falls back to the strongest model of the provider in use when no Claude model is offered', () => {
        expect(
            findSemanticStudioPreset(offered('openai'), 'openai')?.name,
        ).toBe('gpt-6.1-sol');
        expect(
            findSemanticStudioPreset(offered('google'), 'google'),
        ).toBeNull();
        expect(findSemanticStudioPreset(offered('openai'), null)).toBeNull();
    });
});
