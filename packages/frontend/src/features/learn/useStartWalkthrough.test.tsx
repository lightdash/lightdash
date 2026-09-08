import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { useStartWalkthrough } from './useStartWalkthrough';

const { track, openInCopy } = vi.hoisted(() => ({
    track: vi.fn(),
    openInCopy: vi.fn(),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
    useMutation: () => ({ mutate: openInCopy, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org-1' } } }),
}));

vi.mock('../scopeTours/trainingCopy', () => ({
    createTrainingPreview: vi.fn(),
    tourUrlInCopy: vi.fn(),
}));

describe('useStartWalkthrough', () => {
    beforeEach(() => {
        localStorage.clear();
        track.mockClear();
        openInCopy.mockClear();
    });

    it('records the start, where it came from, and opens the copy', () => {
        const { result } = renderHook(() => useStartWalkthrough('training-1'));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith({
            name: EventName.LEARN_WALKTHROUGH_STARTED,
            properties: {
                organizationUuid: 'org-1',
                trainingProjectUuid: 'training-1',
                scope: 'manage:PinnedItems',
                source: 'card',
                isRestart: false,
            },
        });
        expect(openInCopy).toHaveBeenCalledWith({
            scope: 'manage:PinnedItems',
        });
    });

    it.each(['resume', 'recommended'] as const)(
        'carries the %s card as the source',
        (source) => {
            const { result } = renderHook(() =>
                useStartWalkthrough('training-1'),
            );

            act(() => result.current.start('manage:Space', source));

            expect(track.mock.calls[0][0].properties).toMatchObject({ source });
        },
    );

    it('marks a walkthrough the learner has already finished as a restart', () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify(['manage:PinnedItems']),
        );
        const { result } = renderHook(() => useStartWalkthrough('training-1'));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(track.mock.calls[0][0].properties).toMatchObject({
            isRestart: true,
        });
    });

    it('records nothing when the org has no training project', () => {
        const { result } = renderHook(() => useStartWalkthrough(undefined));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(track).not.toHaveBeenCalled();
        expect(openInCopy).not.toHaveBeenCalled();
    });
});
