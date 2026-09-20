import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingCopyBanner } from './TrainingCopyBanner';

const { navigate, mutate, projectsState } = vi.hoisted(() => ({
    navigate: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    projectsState: { current: [] as { projectUuid: string }[] },
}));

vi.mock('react-router', () => ({ useNavigate: () => navigate }));

vi.mock('@tanstack/react-query', () => ({
    useMutation: () => ({ mutate, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({ data: projectsState.current }),
}));

const renderBanner = () =>
    render(
        <MantineProvider env="test">
            <TrainingCopyBanner trainingProjectUuid="training-1" />
        </MantineProvider>,
    );

describe('TrainingCopyBanner', () => {
    beforeEach(() => {
        sessionStorage.clear();
        navigate.mockClear();
        mutate.mockClear();
        projectsState.current = [{ projectUuid: 'training-1' }];
    });

    it('says the copy is not real and does not last', () => {
        renderBanner();

        expect(
            screen.getByText(/practice copy of the training project/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/resets when you start another module/i),
        ).toBeInTheDocument();
    });

    it('sends the learner to the training project library and puts the copy away', async () => {
        renderBanner();

        fireEvent.click(screen.getByText('Back to Learn'));
        await vi.waitFor(() => expect(mutate).toHaveBeenCalled());

        expect(navigate).toHaveBeenCalledWith(
            '/projects/training-1/learn',
            expect.anything(),
        );
        expect(mutate).toHaveBeenCalledWith({
            trainingProjectUuid: 'training-1',
        });
    });

    it('returns to the project the library was opened from, when it is still theirs', async () => {
        sessionStorage.setItem('lightdash.learn.origin', 'their-project');
        projectsState.current = [
            { projectUuid: 'training-1' },
            { projectUuid: 'their-project' },
        ];
        renderBanner();

        fireEvent.click(screen.getByText('Back to Learn'));
        await vi.waitFor(() => expect(mutate).toHaveBeenCalled());

        expect(navigate).toHaveBeenCalledWith(
            '/projects/their-project/learn',
            expect.anything(),
        );
    });

    it('falls back to the training project when the remembered one is gone', async () => {
        sessionStorage.setItem('lightdash.learn.origin', 'deleted-project');
        renderBanner();

        fireEvent.click(screen.getByText('Back to Learn'));
        await vi.waitFor(() => expect(mutate).toHaveBeenCalled());

        expect(navigate).toHaveBeenCalledWith(
            '/projects/training-1/learn',
            expect.anything(),
        );
    });
});
