import { PREVIEW_ENABLED_FEATURE_FLAGS } from '../featureFlags/previewFeatureFlags';
import {
    LIVE_INTEGRATION_CATALOG,
    LIVE_SOURCE_FEATURE_FLAGS,
} from './liveSourceIntegrations';

describe('integration feature flags', () => {
    const declared = Object.values(LIVE_INTEGRATION_CATALOG).flatMap(
        ({ featureFlag }) => (featureFlag ? [featureFlag] : []),
    );

    it('gives each integration its own flag', () => {
        expect(new Set(declared).size).toBe(declared.length);
        expect(LIVE_SOURCE_FEATURE_FLAGS.size).toBe(declared.length);
    });

    it('never forces an integration flag on in previews', () => {
        declared.forEach((flagId) => {
            expect(PREVIEW_ENABLED_FEATURE_FLAGS.has(flagId)).toBe(false);
        });
    });
});
