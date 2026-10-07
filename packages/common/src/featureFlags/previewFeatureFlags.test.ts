import { FeatureFlags } from '../types/featureFlags';
import {
    ALL_FEATURE_FLAG_IDS,
    isKnownFeatureFlagId,
    PREVIEW_ENABLED_FEATURE_FLAGS,
} from './previewFeatureFlags';

describe('Documents feature flag rollout', () => {
    test('registers Documents as a known flag without enabling it in previews', () => {
        expect(ALL_FEATURE_FLAG_IDS).toContain(FeatureFlags.Documents);
        expect(isKnownFeatureFlagId(FeatureFlags.Documents)).toBe(true);
        expect(PREVIEW_ENABLED_FEATURE_FLAGS.has(FeatureFlags.Documents)).toBe(
            false,
        );
    });
});

describe('Separate AI principals rollout', () => {
    test('registers the opt-in flag without enabling it in previews', () => {
        expect(isKnownFeatureFlagId(FeatureFlags.AiSeparatePrincipals)).toBe(
            true,
        );
        expect(
            PREVIEW_ENABLED_FEATURE_FLAGS.has(
                FeatureFlags.AiSeparatePrincipals,
            ),
        ).toBe(false);
    });
});
