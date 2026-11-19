import { describe, expect, it } from 'vitest';
import { VOICE_DESIGN_BUTTON_TOUR_ID, voiceDesignTourSteps } from './steps';

describe('voiceDesignTourSteps', () => {
    it('starts on the Voice Design button on every surface', () => {
        for (const surface of ['dashboard', 'builder', 'app'] as const) {
            expect(voiceDesignTourSteps(surface)[0].target).toBe(
                `[data-tour="${VOICE_DESIGN_BUTTON_TOUR_ID}"]`,
            );
        }
    });

    it('explains drawing with Shift on every surface', () => {
        for (const surface of ['dashboard', 'builder', 'app'] as const) {
            expect(
                voiceDesignTourSteps(surface).some((step) =>
                    String(step.body).includes('Hold Shift'),
                ),
            ).toBe(true);
        }
    });

    it('tells each surface what happens on Stop', () => {
        const stop = (surface: 'dashboard' | 'builder' | 'app') =>
            voiceDesignTourSteps(surface)
                .map((step) => String(step.body))
                .join(' ');
        expect(stop('dashboard')).toContain('preview you can save or discard');
        expect(stop('builder')).toContain('prompt box');
        expect(stop('app')).toContain('AI agent');
    });

    it('mentions continuing the conversation only where an agent thread is used', () => {
        const mentions = (surface: 'dashboard' | 'builder' | 'app') =>
            voiceDesignTourSteps(surface).some((step) =>
                String(step.body).includes('joins that conversation'),
            );
        expect(mentions('dashboard')).toBe(true);
        expect(mentions('app')).toBe(true);
        expect(mentions('builder')).toBe(false);
    });

    it('uses no em dashes or arrows in the copy', () => {
        for (const surface of ['dashboard', 'builder', 'app'] as const) {
            for (const step of voiceDesignTourSteps(surface)) {
                expect(`${step.title} ${String(step.body)}`).not.toMatch(
                    /[—→]/,
                );
            }
        }
    });
});
