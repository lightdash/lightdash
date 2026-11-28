import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerChartUpdateModal } from './ComposerChartUpdateModal';

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useUpdateComposerChart', () => ({
    useUpdateComposerChart: () => ({ mutateAsync, isLoading: false }),
}));

describe('ComposerChartUpdateModal', () => {
    it('sends only the name when only the name changed, even next to an untrimmed description', async () => {
        const onConfirm = vi.fn();
        renderWithProviders(
            <ComposerChartUpdateModal
                opened
                onClose={vi.fn()}
                onConfirm={onConfirm}
                projectUuid="project"
                composerChartUuid="chart"
                name="Orders"
                description=" Weekly "
            />,
        );
        fireEvent.change(screen.getByRole('textbox', { name: 'Chart name' }), {
            target: { value: 'Orders by week' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalled());
        expect(mutateAsync).toHaveBeenCalledWith({ name: 'Orders by week' });
    });
});
