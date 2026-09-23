import { type ApiDuplicateAppResponse } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useDuplicateApp } from '../../apps/hooks/useDuplicateApp';
import ChartTypeForkModal from './ChartTypeForkModal';

vi.mock('../../apps/hooks/useDuplicateApp', () => ({
    useDuplicateApp: vi.fn(),
}));

const mockedDuplicate = vi.fn();
const mockedOnForked = vi.fn();

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
            onForked={mockedOnForked}
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

    it('calls onForked with the mutation result on success', () => {
        const result = {
            appUuid: 'viz-forked',
            slug: 'radial-gauge-custom-2',
            version: 1,
        } satisfies ApiDuplicateAppResponse['results'];
        mockedDuplicate.mockImplementation((_params, options) =>
            options?.onSuccess?.(result),
        );
        renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Fork' }));

        expect(mockedOnForked).toHaveBeenCalledWith(result);
    });

    it('disables submit when the name is cleared', () => {
        renderModal();

        fireEvent.change(screen.getByLabelText(/Name/), {
            target: { value: '' },
        });

        expect(screen.getByRole('button', { name: 'Fork' })).toBeDisabled();
    });
});
