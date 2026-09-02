import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useDuplicateApp } from '../../apps/hooks/useDuplicateApp';
import ChartTypeForkModal from './ChartTypeForkModal';

const mockedNavigate = vi.fn();

vi.mock('react-router', () => ({
    useNavigate: () => mockedNavigate,
}));

vi.mock('../../apps/hooks/useDuplicateApp', () => ({
    useDuplicateApp: vi.fn(),
}));

const mockedDuplicate = vi.fn();

const renderModal = (
    props: Partial<Parameters<typeof ChartTypeForkModal>[0]> = {},
) =>
    renderWithProviders(
        <ChartTypeForkModal
            opened
            onClose={vi.fn()}
            projectUuid="project-1"
            appUuid="viz-1"
            defaultName="Radial gauge (custom)"
            {...props}
        />,
    );

describe('ChartTypeForkModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useDuplicateApp).mockReturnValue({
            mutate: mockedDuplicate,
            isLoading: false,
        } as unknown as ReturnType<typeof useDuplicateApp>);
    });

    it('prefills the name and submits the fork with it', () => {
        renderModal();

        expect(screen.getByLabelText(/Name/)).toHaveValue(
            'Radial gauge (custom)',
        );

        fireEvent.change(screen.getByLabelText(/Name/), {
            target: { value: 'My gauge' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Fork' }));

        expect(mockedDuplicate).toHaveBeenCalledWith(
            { projectUuid: 'project-1', appUuid: 'viz-1', name: 'My gauge' },
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
    });

    it('navigates to the builder for the new app on success', () => {
        mockedDuplicate.mockImplementation((_params, options) =>
            options?.onSuccess?.({ appUuid: 'viz-forked', version: 1 }),
        );
        renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Fork' }));

        expect(mockedNavigate).toHaveBeenCalledWith(
            '/projects/project-1/chart-types/viz-forked',
        );
    });

    it('disables submit when the name is cleared', () => {
        renderModal();

        fireEvent.change(screen.getByLabelText(/Name/), {
            target: { value: '' },
        });

        expect(screen.getByRole('button', { name: 'Fork' })).toBeDisabled();
    });
});
