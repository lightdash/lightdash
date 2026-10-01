import { describe, expect, it } from 'vitest';
import { getNoProjectLandingPath } from './noProjectLanding';

describe('getNoProjectLandingPath', () => {
    it('lands on the agentic homepage when it is on', () => {
        expect(
            getNoProjectLandingPath({
                isNewOnboardingEnabled: true,
                isHomepageBuilderEnabled: true,
            }),
        ).toBe('/get-started');
    });

    it('opens the warehouse picker without the agentic homepage', () => {
        expect(
            getNoProjectLandingPath({
                isNewOnboardingEnabled: true,
                isHomepageBuilderEnabled: false,
            }),
        ).toBe('/onboarding/data-source');
    });

    it('keeps the legacy project page without new onboarding', () => {
        expect(
            getNoProjectLandingPath({
                isNewOnboardingEnabled: false,
                isHomepageBuilderEnabled: true,
            }),
        ).toBe('/createProject');
    });
});
