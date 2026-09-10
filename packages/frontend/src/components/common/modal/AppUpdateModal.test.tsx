import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AppUpdateModal from './AppUpdateModal';

vi.mock('../../../features/apps/hooks/useUpdateApp', () => ({
    useUpdateApp: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));

describe('AppUpdateModal', () => {
    it('keeps the icon picker beside the labeled name field without its own visible label', () => {
        renderWithProviders(
            <AppUpdateModal
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                uuid="app-uuid"
                initialName="Stacked area chart"
                initialDescription=""
                iconPicker={{ initialIcon: 'chart-area-line' }}
            />,
        );

        expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
        expect(screen.getByLabelText('Chart type icon')).toBeVisible();
        expect(screen.queryByText('Icon')).not.toBeInTheDocument();
    });
});
