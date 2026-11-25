import { describe, expect, it } from 'vitest';
import { DESIGN_MODE_BUTTON_TOUR_ID, designModeTourSteps } from './steps';

const SURFACES = ['dashboard', 'builder', 'app'] as const;
const text = (surface: (typeof SURFACES)[number]) =>
    designModeTourSteps(surface)
        .map((step) => `${String(step.title)} ${String(step.body)}`)
        .join(' ');

describe('designModeTourSteps', () => {
    it('starts on the Design Mode button on every surface', () => {
        for (const surface of SURFACES) {
            expect(designModeTourSteps(surface)[0].target).toBe(
                `[data-tour="${DESIGN_MODE_BUTTON_TOUR_ID}"]`,
            );
        }
    });

    it('points at the toolbar and its voice button once the mode is on', () => {
        const [, mark, say] = designModeTourSteps('dashboard');
        expect(mark.target).toBe('[data-tour="design-mode-toolbar"]');
        expect(say.target).toBe('[data-tour="design-mode-voice"]');
    });

    it('explains the hotkey and Voice Mode on every surface', () => {
        for (const surface of SURFACES) {
            expect(text(surface)).toContain('Hold Option/Alt to mark');
            expect(text(surface)).toContain('Voice Mode');
            expect(text(surface)).toContain('activate the microphone');
        }
    });

    it('tells each surface where its marks go', () => {
        expect(text('dashboard')).toContain('Conversational threads');
        expect(text('app')).toContain('Conversational threads');
        expect(text('builder')).toContain('as one prompt');
    });

    it('never names the product, since apps and dashboards can be embedded', () => {
        for (const surface of SURFACES) {
            expect(text(surface)).not.toContain('Lightdash');
        }
    });
});
