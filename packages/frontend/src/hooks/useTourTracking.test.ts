// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../types/Events';
import { useTourTracking, type TourTracking } from './useTourTracking';

const track = vi.fn();
vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

const tracking: TourTracking = {
    tour: 'dashboardEditTour',
};

type Props = {
    tracking: TourTracking | null;
    opened: boolean;
    stepIndex: number | null;
};

const renderTour = (initialProps: Props) =>
    renderHook((props: Props) => useTourTracking({ ...props, stepCount: 4 }), {
        initialProps,
    });

const eventNames = () => track.mock.calls.map(([event]) => event.name);

describe('useTourTracking', () => {
    beforeEach(() => track.mockClear());

    it('reports nothing until the tour opens', () => {
        renderTour({ tracking, opened: false, stepIndex: 0 });
        expect(track).not.toHaveBeenCalled();
    });

    it('reports the start once and each step as it is shown', () => {
        const { rerender } = renderTour({
            tracking,
            opened: true,
            stepIndex: 0,
        });
        rerender({ tracking, opened: true, stepIndex: 0 });
        rerender({ tracking, opened: true, stepIndex: 1 });

        expect(eventNames()).toEqual([
            EventName.GUIDED_TOUR_STARTED,
            EventName.GUIDED_TOUR_STEP_VIEWED,
            EventName.GUIDED_TOUR_STEP_VIEWED,
        ]);
        expect(track).toHaveBeenLastCalledWith({
            name: EventName.GUIDED_TOUR_STEP_VIEWED,
            properties: {
                tour: 'dashboardEditTour',
                stepIndex: 1,
                stepCount: 4,
            },
        });
    });

    it('reports the furthest step reached when dismissed after going back', () => {
        const { result, rerender } = renderTour({
            tracking,
            opened: true,
            stepIndex: 0,
        });
        rerender({ tracking, opened: true, stepIndex: 2 });
        rerender({ tracking, opened: true, stepIndex: 1 });
        result.current.trackEnded('dismissed');

        expect(track).toHaveBeenLastCalledWith({
            name: EventName.GUIDED_TOUR_DISMISSED,
            properties: expect.objectContaining({
                furthestStepIndex: 2,
                stepCount: 4,
            }),
        });
    });

    it('reports no step reached when dismissed before any step was shown', () => {
        const { result } = renderTour({
            tracking,
            opened: true,
            stepIndex: null,
        });
        result.current.trackEnded('dismissed');

        expect(track).toHaveBeenLastCalledWith({
            name: EventName.GUIDED_TOUR_DISMISSED,
            properties: expect.objectContaining({ furthestStepIndex: null }),
        });
    });

    it('reports a tour as ended only once', () => {
        const { result, rerender } = renderTour({
            tracking,
            opened: true,
            stepIndex: 3,
        });
        result.current.trackEnded('completed');
        result.current.trackEnded('dismissed');
        rerender({ tracking, opened: true, stepIndex: 0 });

        expect(eventNames()).toEqual([
            EventName.GUIDED_TOUR_STARTED,
            EventName.GUIDED_TOUR_STEP_VIEWED,
            EventName.GUIDED_TOUR_COMPLETED,
        ]);
    });

    it('reports a new start when the tour is opened again', () => {
        const { result, rerender } = renderTour({
            tracking,
            opened: true,
            stepIndex: 0,
        });
        result.current.trackEnded('dismissed');
        rerender({ tracking, opened: false, stepIndex: 0 });
        rerender({ tracking, opened: true, stepIndex: 0 });

        expect(
            eventNames().filter(
                (name) => name === EventName.GUIDED_TOUR_STARTED,
            ),
        ).toHaveLength(2);
    });

    it('reports nothing for a tour that is not tracked', () => {
        const { result } = renderTour({
            tracking: null,
            opened: true,
            stepIndex: 0,
        });
        result.current.trackEnded('completed');
        expect(track).not.toHaveBeenCalled();
    });
});
