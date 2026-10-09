import {
    assertInferenceGeographyForRegion,
    isMultiCredentialAiProvider,
    parseCredentialConfig,
    toApiCredential,
    type AiProviderCredentialResolution,
} from './AiOrganizationProviderCredentialModel';

const config = {
    apiKey: 'ABSKbedrocklongenoughkey1234',
    region: 'ap-northeast-1',
    allowedModels: ['claude-sonnet-4-5'],
};

const row = {
    ai_organization_provider_credential_uuid: 'cred-1',
    provider: 'bedrock',
    label: 'Japan (Tokyo)',
    is_default: false,
};

describe('parseCredentialConfig', () => {
    it('accepts a complete config', () => {
        expect(parseCredentialConfig(config)).toEqual(config);
    });

    it('rejects a config with no allowed models', () => {
        expect(
            parseCredentialConfig({ ...config, allowedModels: [] }),
        ).toBeNull();
    });

    it('rejects a config with no region', () => {
        expect(parseCredentialConfig({ ...config, region: '' })).toBeNull();
    });

    it('rejects a config with no key', () => {
        expect(parseCredentialConfig({ ...config, apiKey: '' })).toBeNull();
    });

    // A credential that cannot be parsed must not degrade to a partial config:
    // callers fail closed on null rather than running in the wrong region.
    it('rejects a non-object payload', () => {
        expect(parseCredentialConfig('not-a-config')).toBeNull();
        expect(parseCredentialConfig(null)).toBeNull();
    });

    // Rows saved before geographies were configurable have no stored value and
    // must keep parsing — they resolve to the region's default downstream.
    it('accepts a config without an inference geography', () => {
        expect(parseCredentialConfig(config)).toEqual(config);
    });

    it('accepts a config with an inference geography', () => {
        const withGeography = { ...config, inferenceGeography: 'jp' };
        expect(parseCredentialConfig(withGeography)).toEqual(withGeography);
    });

    it('rejects an unknown inference geography', () => {
        expect(
            parseCredentialConfig({ ...config, inferenceGeography: 'mars' }),
        ).toBeNull();
    });
});

describe('assertInferenceGeographyForRegion', () => {
    it('allows an absent geography', () => {
        expect(() =>
            assertInferenceGeographyForRegion({ region: 'ap-northeast-1' }),
        ).not.toThrow();
    });

    it('allows the narrow geography and explicit widenings for Japan', () => {
        (['jp', 'global'] as const).forEach((inferenceGeography) => {
            expect(() =>
                assertInferenceGeographyForRegion({
                    region: 'ap-northeast-1',
                    inferenceGeography,
                }),
            ).not.toThrow();
        });
    });

    // AWS documents no APAC inference profile for the current Claude
    // generation, so a Tokyo credential widened to `apac` would pass region
    // checks and then fail at every prompt. Offered geographies must have a
    // profile for every model we ship.
    it('rejects apac for Japan regions', () => {
        expect(() =>
            assertInferenceGeographyForRegion({
                region: 'ap-northeast-1',
                inferenceGeography: 'apac',
            }),
        ).toThrow(/not available for region ap-northeast-1/);
    });

    // Bedrock has no `jp` profile outside Japan, so a stale pairing (e.g. a
    // region edit that keeps the stored geography) must fail at write time
    // rather than at the organization's first prompt.
    it('rejects a geography the region has no profile for', () => {
        expect(() =>
            assertInferenceGeographyForRegion({
                region: 'us-east-1',
                inferenceGeography: 'jp',
            }),
        ).toThrow(/not available for region us-east-1/);
    });
});

describe('isMultiCredentialAiProvider', () => {
    it('accepts bedrock', () => {
        expect(isMultiCredentialAiProvider('bedrock')).toBe(true);
    });

    it('rejects single-key BYO providers', () => {
        expect(isMultiCredentialAiProvider('anthropic')).toBe(false);
        expect(isMultiCredentialAiProvider('openai')).toBe(false);
    });
});

describe('toApiCredential', () => {
    it('exposes a key hint and never the key itself', () => {
        const credential = toApiCredential(row, config);
        expect(credential).not.toBeNull();
        expect(credential?.apiKeyHint).not.toContain(config.apiKey);
        expect(JSON.stringify(credential)).not.toContain(config.apiKey);
    });

    it('carries region, models and the default flag', () => {
        expect(toApiCredential({ ...row, is_default: true }, config)).toEqual({
            uuid: 'cred-1',
            provider: 'bedrock',
            label: 'Japan (Tokyo)',
            region: 'ap-northeast-1',
            allowedModels: ['claude-sonnet-4-5'],
            apiKeyHint: expect.any(String),
            isDefault: true,
            // No stored choice resolves to the region's default geography, so
            // the API always states where inference runs.
            inferenceGeography: 'jp',
        });
    });

    it('prefers a stored inference geography over the region default', () => {
        expect(
            toApiCredential(row, { ...config, inferenceGeography: 'global' })
                ?.inferenceGeography,
        ).toBe('global');
    });

    it('returns null for a provider that cannot hold multiple credentials', () => {
        expect(
            toApiCredential({ ...row, provider: 'anthropic' }, config),
        ).toBeNull();
    });
});

// `none` means nothing was selected, so falling back is correct. `unreadable`
// means something WAS selected and cannot be read, so falling back would
// process data in the wrong region. The two must never collapse.
describe('AiProviderCredentialResolution', () => {
    const resolutions: AiProviderCredentialResolution[] = [
        { status: 'none' },
        { status: 'unreadable', uuid: 'cred-1', label: 'Japan (Tokyo)' },
        {
            status: 'ok',
            credential: {
                uuid: 'cred-1',
                organizationUuid: 'org-1',
                provider: 'bedrock',
                label: 'Japan (Tokyo)',
                isDefault: true,
                config,
            },
        },
    ];

    it('distinguishes all three outcomes', () => {
        expect(resolutions.map((r) => r.status)).toEqual([
            'none',
            'unreadable',
            'ok',
        ]);
    });

    it('names the unreadable credential so it can be repaired', () => {
        const unreadable = resolutions.find((r) => r.status === 'unreadable');
        expect(unreadable).toEqual({
            status: 'unreadable',
            uuid: 'cred-1',
            label: 'Japan (Tokyo)',
        });
    });
});
