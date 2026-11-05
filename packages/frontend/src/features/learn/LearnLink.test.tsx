import { Ability } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnLink } from './LearnLink';

const mocks = vi.hoisted(() => ({
    useProjects: vi.fn(),
    useApp: vi.fn(),
}));

vi.mock('../../hooks/useProjects', () => ({
    useProjects: mocks.useProjects,
}));

vi.mock('../../providers/App/useApp', () => ({
    default: mocks.useApp,
}));

// No feature flag is mocked: the link depends only on the user's Learn
// ability and the project type.
describe('LearnLink', () => {
    afterEach(cleanup);

    it.each([
        {
            type: ProjectType.DEFAULT,
            visible: true,
            canViewLearn: true,
        },
        {
            type: ProjectType.TRAINING,
            visible: true,
            canViewLearn: true,
        },
        {
            type: ProjectType.PREVIEW,
            visible: false,
            canViewLearn: true,
        },
        {
            type: ProjectType.DEFAULT,
            visible: false,
            canViewLearn: false,
        },
    ])(
        'renders with Learn access $canViewLearn on $type: $visible',
        ({ type, visible, canViewLearn }) => {
            mocks.useApp.mockReturnValue({
                user: {
                    data: {
                        organizationUuid: 'org-1',
                        ability: new Ability(
                            canViewLearn
                                ? [
                                      {
                                          action: 'view',
                                          subject: 'Learn',
                                          conditions: {
                                              organizationUuid: 'org-1',
                                          },
                                      },
                                  ]
                                : [],
                        ),
                    },
                },
            });
            mocks.useProjects.mockReturnValue({
                data: [{ projectUuid: 'project', type }],
            });
            render(
                <MantineProvider>
                    <MemoryRouter>
                        <LearnLink projectUuid="project" />
                    </MemoryRouter>
                </MantineProvider>,
            );
            expect(
                screen.queryByRole('button', { name: 'Learn' }) !== null,
            ).toBe(visible);
        },
    );
});
