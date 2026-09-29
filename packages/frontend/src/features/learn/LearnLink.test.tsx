import { Ability } from '@casl/ability';
import { FeatureFlags, ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnLink } from './LearnLink';

const mocks = vi.hoisted(() => ({
    useServerFeatureFlag: vi.fn(),
    useProjects: vi.fn(),
    useApp: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: mocks.useServerFeatureFlag,
}));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: mocks.useProjects,
}));

vi.mock('../../providers/App/useApp', () => ({
    default: mocks.useApp,
}));

describe('LearnLink', () => {
    afterEach(cleanup);

    it.each([
        {
            enabled: undefined,
            type: ProjectType.DEFAULT,
            visible: false,
            canViewLearn: true,
        },
        {
            enabled: false,
            type: ProjectType.DEFAULT,
            visible: false,
            canViewLearn: true,
        },
        {
            enabled: true,
            type: ProjectType.DEFAULT,
            visible: true,
            canViewLearn: true,
        },
        {
            enabled: true,
            type: ProjectType.PREVIEW,
            visible: false,
            canViewLearn: true,
        },
        {
            enabled: true,
            type: ProjectType.DEFAULT,
            visible: false,
            canViewLearn: false,
        },
    ])(
        'renders with flag $enabled and Learn access $canViewLearn on $type: $visible',
        ({ enabled, type, visible, canViewLearn }) => {
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
            mocks.useServerFeatureFlag.mockReturnValue({
                data:
                    enabled === undefined
                        ? undefined
                        : { id: FeatureFlags.EnableLearn, enabled },
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
            expect(mocks.useServerFeatureFlag).toHaveBeenCalledWith(
                FeatureFlags.EnableLearn,
            );
        },
    );
});
