import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import DismissedDraftAlert from './DismissedDraftAlert';

describe('DismissedDraftAlert', () => {
    it('lets the author reopen their preserved draft', () => {
        const onReopen = vi.fn();

        renderWithProviders(
            <DismissedDraftAlert isReopening={false} onReopen={onReopen} />,
        );

        expect(
            screen.getByText('Your dismissed draft is still available'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Reopen it to continue editing/),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reopen draft' }));
        expect(onReopen).toHaveBeenCalledOnce();
    });
});
