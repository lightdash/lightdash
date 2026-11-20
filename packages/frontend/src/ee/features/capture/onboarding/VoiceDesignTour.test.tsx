import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { VOICE_DESIGN_TOUR_STORAGE_KEY } from './tourStorage';
import { VoiceDesignTour } from './VoiceDesignTour';

const opened = vi.hoisted(() => ({ value: false }));
vi.mock('../../../../components/common/GuidedTour', () => ({
    GuidedTour: ({ opened: isOpen }: { opened: boolean }) => {
        opened.value = isOpen;
        return null;
    },
}));

describe('VoiceDesignTour', () => {
    beforeEach(() => {
        localStorage.clear();
        opened.value = false;
    });

    it('shows once, wherever it is first seen', () => {
        const first = renderWithProviders(<VoiceDesignTour surface="app" />);
        expect(opened.value).toBe(true);
        localStorage.setItem(VOICE_DESIGN_TOUR_STORAGE_KEY, '1');
        first.unmount();

        renderWithProviders(<VoiceDesignTour surface="builder" />);
        expect(opened.value).toBe(false);
    });

    it('counts a tour seen on one page before the shared flag existed', () => {
        localStorage.setItem('ld.voice-design.dashboard.tour.v1', '1');
        renderWithProviders(<VoiceDesignTour surface="app" />);
        expect(opened.value).toBe(false);
    });
});
