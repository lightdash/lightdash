import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { DesignModeTour } from './DesignModeTour';
import { DESIGN_MODE_TOUR_STORAGE_KEY } from './tourStorage';

const opened = vi.hoisted(() => ({ value: false }));
vi.mock('../../../../components/common/GuidedTour', () => ({
    GuidedTour: ({ opened: isOpen }: { opened: boolean }) => {
        opened.value = isOpen;
        return null;
    },
}));

describe('DesignModeTour', () => {
    beforeEach(() => {
        localStorage.clear();
        opened.value = false;
    });

    it('shows once, wherever it is first seen', () => {
        const first = renderWithProviders(<DesignModeTour surface="app" />);
        expect(opened.value).toBe(true);
        localStorage.setItem(DESIGN_MODE_TOUR_STORAGE_KEY, '1');
        first.unmount();

        renderWithProviders(<DesignModeTour surface="builder" />);
        expect(opened.value).toBe(false);
    });

    it('shows again to someone who only saw the tour it replaced', () => {
        localStorage.setItem('ld.voice-design.tour.v1', '1');
        renderWithProviders(<DesignModeTour surface="dashboard" />);
        expect(opened.value).toBe(true);
    });
});
