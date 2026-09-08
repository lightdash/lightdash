import { ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import ScopeTourHost from './ScopeTourHost';

const SCOPE = 'manage:PinnedItems';
const NEXT_SCOPE = 'manage:Space';

const { track, navigate, mutate, searchState } = vi.hoisted(() => ({
    track: vi.fn(),
    navigate: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    searchState: { current: new URLSearchParams() },
}));

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
    useParams: () => ({ projectUuid: 'copy-1' }),
    useSearchParams: () => [
        searchState.current,
        (next: URLSearchParams) => {
            searchState.current = next;
        },
    ],
}));

vi.mock('@tanstack/react-query', () => ({
    useMutation: () => ({ mutate, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org-1' } } }),
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
}));

vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            projectUuid: 'copy-1',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: 'training-1',
        },
    }),
}));

vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: [{ projectUuid: 'training-1', type: ProjectType.TRAINING }],
    }),
}));

vi.mock('./generated', () => {
    const step = (title: string) => ({
        target: '[data-tour-step]',
        title,
        body: 'body',
        interactive: false,
        advanceOnTargetClick: false,
        advanceOnTargetInput: false,
        via: [],
    });
    return {
        SCOPE_TOURS: {
            'manage:PinnedItems': {
                scope: 'manage:PinnedItems',
                title: 'Pin things',
                sources: [],
                steps: [step('one'), step('two'), step('three')],
            },
            'manage:Space': {
                scope: 'manage:Space',
                title: 'Make a space',
                sources: [],
                steps: [step('one')],
            },
        },
    };
});

vi.mock('./trainingCopy', () => ({
    createTrainingPreview: vi.fn(),
    deleteTrainingPreviews: vi.fn(),
    tourUrlInCopy: () => '/projects/copy-2/home?tour=manage:Space',
    LEAVING_COPY_STATE: {},
}));

vi.mock('../learn/LearnDoneModal', () => ({
    LearnDoneModal: ({ onNext }: { onNext: (scope: string) => void }) => (
        <button type="button" onClick={() => onNext(NEXT_SCOPE)}>
            next module
        </button>
    ),
}));

// Stands in for the tour card: the three things the learner can do with it,
// with Got it firing onFinish and onClose on the one click as the real one
// does.
vi.mock('../../components/common/GuidedTour', () => ({
    GuidedTour: ({
        onClose,
        onFinish,
        onStepChange,
    }: {
        onClose: () => void;
        onFinish?: () => void;
        onStepChange?: (stepIndex: number, beacon: null) => void;
    }) => (
        <div>
            <button type="button" onClick={() => onStepChange?.(2, null)}>
                advance
            </button>
            <button
                type="button"
                onClick={() => {
                    onFinish?.();
                    onClose();
                }}
            >
                got it
            </button>
            <button type="button" onClick={() => onClose()}>
                skip
            </button>
        </div>
    ),
}));

const renderHost = () =>
    render(
        <MantineProvider env="test">
            <ScopeTourHost />
        </MantineProvider>,
    );

const learnEvents = () =>
    track.mock.calls
        .map(([event]) => event)
        .filter((event) => String(event.name).startsWith('learn_'));

describe('ScopeTourHost analytics', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        track.mockClear();
        navigate.mockClear();
        mutate.mockClear();
        searchState.current = new URLSearchParams(
            `tour=${SCOPE}&copy=true&from=learn`,
        );
    });

    it('records a completion, and no dismissal, when the tour is finished', () => {
        renderHost();

        fireEvent.click(screen.getByText('got it'));

        expect(learnEvents()).toEqual([
            {
                name: EventName.LEARN_WALKTHROUGH_COMPLETED,
                properties: {
                    organizationUuid: 'org-1',
                    trainingProjectUuid: 'training-1',
                    scope: SCOPE,
                    stepCount: 3,
                    durationSeconds: expect.any(Number),
                },
            },
        ]);
    });

    it('records a dismissal at the step reached, and no completion, on skip', () => {
        renderHost();

        fireEvent.click(screen.getByText('advance'));
        fireEvent.click(screen.getByText('skip'));

        expect(learnEvents()).toEqual([
            {
                name: EventName.LEARN_WALKTHROUGH_DISMISSED,
                properties: {
                    organizationUuid: 'org-1',
                    trainingProjectUuid: 'training-1',
                    scope: SCOPE,
                    stepIndex: 2,
                    stepCount: 3,
                    durationSeconds: expect.any(Number),
                },
            },
        ]);
    });

    it('records the next module started from the completion dialog', () => {
        renderHost();

        fireEvent.click(screen.getByText('got it'));
        fireEvent.click(screen.getByText('next module'));

        expect(learnEvents()[1]).toEqual({
            name: EventName.LEARN_WALKTHROUGH_STARTED,
            properties: {
                organizationUuid: 'org-1',
                trainingProjectUuid: 'training-1',
                scope: NEXT_SCOPE,
                source: 'next_from_completion',
                isRestart: false,
            },
        });
    });

    it('records a start for a tour opened by link, since nothing else did', () => {
        searchState.current = new URLSearchParams(`tour=${SCOPE}&copy=true`);

        renderHost();
        fireEvent.click(screen.getByText('got it'));

        expect(learnEvents().map((event) => event.name)).toEqual([
            EventName.LEARN_WALKTHROUGH_STARTED,
            EventName.LEARN_WALKTHROUGH_COMPLETED,
        ]);
        expect(learnEvents()[0].properties).toMatchObject({
            scope: SCOPE,
            source: 'deep_link',
            trainingProjectUuid: 'training-1',
        });
        expect(
            JSON.parse(localStorage.getItem('lightdash.learn.started') ?? '[]'),
        ).toContain(SCOPE);
    });

    it('does not record a second start for a tour the library already started', () => {
        renderHost();
        fireEvent.click(screen.getByText('got it'));

        expect(learnEvents().map((event) => event.name)).toEqual([
            EventName.LEARN_WALKTHROUGH_COMPLETED,
        ]);
    });

    it('reports a walkthrough the learner has finished before as a restart', () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify([NEXT_SCOPE]),
        );
        renderHost();

        fireEvent.click(screen.getByText('got it'));
        fireEvent.click(screen.getByText('next module'));

        expect(learnEvents()[1].properties).toMatchObject({ isRestart: true });
    });
});
