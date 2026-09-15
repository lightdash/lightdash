import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { useStartWalkthrough } from './useStartWalkthrough';

const { track, openInCopy, navigate, markScopeStarted, progressState } =
    vi.hoisted(() => ({
        track: vi.fn(),
        navigate: vi.fn(),
        openInCopy: vi.fn(),
        markScopeStarted: vi.fn(),
        progressState: { completed: [] as string[] },
    }));

vi.mock('./progress', () => ({
    useLearnProgress: () => ({
        completed: progressState.completed,
        started: [],
        lastStarted: null,
        isSettled: true,
    }),
    useLearnProgressActions: () => ({
        markScopeStarted,
        markScopeCompleted: vi.fn(),
    }),
}));

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
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
        sessionStorage.clear();
        progressState.completed = [];
        navigate.mockClear();
        track.mockClear();
        openInCopy.mockClear();
        markScopeStarted.mockClear();
    });

    it('does not start an unsupported module or open its old reader', () => {
        const { result } = renderHook(() => useStartWalkthrough('training-1'));
        act(() => result.current.start('view:Analytics', 'card'));
        expect(navigate).not.toHaveBeenCalled();
        expect(openInCopy).not.toHaveBeenCalled();
        expect(track).not.toHaveBeenCalled();
        expect(markScopeStarted).not.toHaveBeenCalled();
    });

    it('records the start, where it came from, and opens the copy', () => {
        const { result } = renderHook(() => useStartWalkthrough('training-1'));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(markScopeStarted).toHaveBeenCalledWith('manage:PinnedItems');
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
        progressState.completed = ['manage:PinnedItems'];
        const { result } = renderHook(() => useStartWalkthrough('training-1'));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(track.mock.calls[0][0].properties).toMatchObject({
            isRestart: true,
        });
    });

    it('starts a docs lesson like any other module', () => {
        const { result } = renderHook(() => useStartWalkthrough('training-1'));

        act(() => result.current.start('docs:semantic-layer/metrics', 'card'));

        expect(openInCopy).toHaveBeenCalledWith({
            scope: 'docs:semantic-layer/metrics',
        });
        expect(
            JSON.parse(localStorage.getItem('lightdash.learn.started')!),
        ).toContain('docs:semantic-layer/metrics');
    });

    it('records nothing when the org has no training project', () => {
        const { result } = renderHook(() => useStartWalkthrough(undefined));

        act(() => result.current.start('manage:PinnedItems', 'card'));

        expect(track).not.toHaveBeenCalled();
        expect(openInCopy).not.toHaveBeenCalled();
    });
});
