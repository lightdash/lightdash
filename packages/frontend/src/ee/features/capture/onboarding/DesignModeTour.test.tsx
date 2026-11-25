import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { DesignModeTour } from './DesignModeTour';
import { DESIGN_MODE_TOUR_STORAGE_KEY } from './tourStorage';

const opened = vi.hoisted(() => ({ value: false }));
const stepChange = vi.hoisted(() => ({
    go: (_index: number) => {},
}));
vi.mock('../../../../components/common/GuidedTour', () => ({
    GuidedTour: ({
        opened: isOpen,
        onStepChange,
    }: {
        opened: boolean;
        onStepChange: (index: number) => void;
    }) => {
        opened.value = isOpen;
        stepChange.go = onStepChange;
        return null;
    },
}));

describe('DesignModeTour', () => {
    beforeEach(() => {
        localStorage.clear();
        opened.value = false;
    });

    it('shows once, wherever it is first seen', () => {
        const first = renderWithProviders(
            <DesignModeTour surface="app" onTurnOn={() => {}} />,
        );
        expect(opened.value).toBe(true);
        localStorage.setItem(DESIGN_MODE_TOUR_STORAGE_KEY, '1');
        first.unmount();

        renderWithProviders(
            <DesignModeTour surface="builder" onTurnOn={() => {}} />,
        );
        expect(opened.value).toBe(false);
    });

    it('turns the mode on when it reaches the steps about the toolbar', () => {
        const onTurnOn = vi.fn();
        renderWithProviders(
            <DesignModeTour surface="dashboard" onTurnOn={onTurnOn} />,
        );
        stepChange.go(0);
        expect(onTurnOn).not.toHaveBeenCalled();
        stepChange.go(1);
        expect(onTurnOn).toHaveBeenCalledTimes(1);
    });

    it('shows again to someone who only saw the tour it replaced', () => {
        localStorage.setItem('ld.voice-design.tour.v1', '1');
        renderWithProviders(
            <DesignModeTour surface="dashboard" onTurnOn={() => {}} />,
        );
        expect(opened.value).toBe(true);
    });
});
