// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type TourTracking } from '../../../hooks/useTourTracking';
import { renderWithProviders } from '../../../testing/testUtils';
import { EventName } from '../../../types/Events';
import { GuidedTour, type GuidedTourStep } from './GuidedTour';

const track = vi.fn();
vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

const steps: GuidedTourStep[] = [
    { target: null, title: 'Step one', body: 'first body' },
    { target: null, title: 'Step two', body: 'second body' },
];

const tracking: TourTracking = {
    tour: 'dashboardEditTour',
};

const eventNames = () => track.mock.calls.map(([event]) => event.name);

describe('GuidedTour tracking', () => {
    beforeEach(() => track.mockClear());

    it('reports a tour walked to the end as completed', async () => {
        renderWithProviders(
            <GuidedTour
                steps={steps}
                opened
                tracking={tracking}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await userEvent.click(screen.getByRole('button', { name: 'Got it' }));

        expect(eventNames()).toEqual([
            EventName.GUIDED_TOUR_STARTED,
            EventName.GUIDED_TOUR_STEP_VIEWED,
            EventName.GUIDED_TOUR_STEP_VIEWED,
            EventName.GUIDED_TOUR_COMPLETED,
        ]);
    });

    it('reports a skipped tour as dismissed at the step it was left on', async () => {
        renderWithProviders(
            <GuidedTour
                steps={steps}
                opened
                tracking={tracking}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

        expect(track).toHaveBeenLastCalledWith({
            name: EventName.GUIDED_TOUR_DISMISSED,
            properties: expect.objectContaining({
                furthestStepIndex: 0,
                stepCount: 2,
            }),
        });
    });

    it('reports nothing for a tour that is not tracked', async () => {
        renderWithProviders(
            <GuidedTour
                steps={steps}
                opened
                tracking={null}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

        expect(track).not.toHaveBeenCalled();
    });
});
