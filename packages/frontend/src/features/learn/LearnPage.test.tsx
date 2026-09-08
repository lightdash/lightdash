import { Ability } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { buildLearnCatalogue } from './catalogue';
import LearnPage from './LearnPage';

const { track, projectState, healthState } = vi.hoisted(() => ({
    track: vi.fn(),
    projectState: { current: [] as unknown[] },
    healthState: { current: { learn: { enabled: true } } },
}));

vi.mock('react-router', () => ({
    Navigate: () => null,
}));

vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: {
                organizationUuid: 'org-1',
                role: 'admin',
                ability: new Ability([
                    { action: 'manage', subject: 'Organization' },
                ]),
            },
        },
    }),
}));

vi.mock('../../hooks/health/useHealth', () => ({
    default: () => ({ data: healthState.current }),
}));

vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({ data: projectState.current }),
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
}));

// The real gates ask the licence and the AI settings; the library's own
// counting is what is under test, so every module is open here.
vi.mock('./availability', () => ({
    useLearnAvailability: () => ({ isOpen: () => true }),
}));

vi.mock('./useEnableLearn', () => ({
    useEnableLearn: () => ({ mutate: vi.fn(), isLoading: false, error: null }),
}));

vi.mock('./useStartWalkthrough', () => ({
    useStartWalkthrough: () => ({ start: vi.fn(), opening: null }),
}));

vi.mock('./thumbnails', () => ({
    thumbnailFor: () => undefined,
}));

const catalogue = buildLearnCatalogue();
const scopes = catalogue.map((module) => module.scope);

const renderPage = () =>
    render(
        <MantineProvider env="test">
            <LearnPage />
        </MantineProvider>,
    );

const viewEvents = () =>
    track.mock.calls
        .map(([event]) => event)
        .filter((event) => event.name === EventName.LEARN_LIBRARY_VIEWED);

describe('LearnPage analytics', () => {
    beforeEach(() => {
        localStorage.clear();
        track.mockClear();
        healthState.current = { learn: { enabled: true } };
        projectState.current = [
            { projectUuid: 'training-1', type: ProjectType.TRAINING },
        ];
    });

    it('records one view per mount, with the progress the learner is looking at', () => {
        localStorage.setItem(
            'lightdash.learn.started',
            JSON.stringify([scopes[0], scopes[1]]),
        );
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify([scopes[0]]),
        );

        const { rerender } = renderPage();
        rerender(
            <MantineProvider env="test">
                <LearnPage />
            </MantineProvider>,
        );

        expect(viewEvents()).toEqual([
            {
                name: EventName.LEARN_LIBRARY_VIEWED,
                properties: {
                    organizationUuid: 'org-1',
                    trainingProjectUuid: 'training-1',
                    hasTrainingProject: true,
                    moduleCount: catalogue.length,
                    startedCount: 2,
                    completedCount: 1,
                },
            },
        ]);
    });

    it('counts only the scopes this instance has modules for', () => {
        localStorage.setItem(
            'lightdash.learn.completed',
            JSON.stringify([scopes[0], 'manage:SomethingRetired']),
        );

        renderPage();

        expect(viewEvents()[0].properties).toMatchObject({
            completedCount: 1,
        });
    });

    it('records the call to action before an admin has enabled Learn', () => {
        projectState.current = [
            { projectUuid: 'other-1', type: ProjectType.DEFAULT },
        ];

        renderPage();

        expect(viewEvents()[0].properties).toMatchObject({
            trainingProjectUuid: null,
            hasTrainingProject: false,
        });
    });

    it('records nothing when Learn is switched off for the instance', () => {
        healthState.current = { learn: { enabled: false } };

        renderPage();

        expect(viewEvents()).toEqual([]);
    });
});
