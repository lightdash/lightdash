import { FeatureFlags, ProjectType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnLink } from './LearnLink';

const mocks = vi.hoisted(() => ({
    useServerFeatureFlag: vi.fn(),
    useProjects: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: mocks.useServerFeatureFlag,
}));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: mocks.useProjects,
}));

describe('LearnLink', () => {
    afterEach(cleanup);

    it.each([
        { enabled: undefined, type: ProjectType.DEFAULT, visible: false },
        { enabled: false, type: ProjectType.DEFAULT, visible: false },
        { enabled: true, type: ProjectType.DEFAULT, visible: true },
        { enabled: true, type: ProjectType.PREVIEW, visible: false },
    ])(
        'renders with flag $enabled on $type: $visible',
        ({ enabled, type, visible }) => {
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
