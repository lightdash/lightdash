import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import DraftOverlayFailureAlert from './DraftOverlayFailureAlert';

describe('DraftOverlayFailureAlert', () => {
    it('clearly tells the author that published content is shown and the draft is safe', () => {
        renderWithProviders(
            <DraftOverlayFailureAlert
                error={{
                    code: 'invalid_dashboard_draft',
                    draftUuid: 'draft-uuid',
                }}
            />,
        );

        expect(
            screen.getByText("Your unpublished draft couldn't be displayed"),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/You're viewing the published dashboard/),
        ).toBeInTheDocument();
        expect(screen.getByText(/draft is still saved/)).toBeInTheDocument();
        expect(
            screen.getByText(/Ask a Content as Code admin/),
        ).toBeInTheDocument();
    });
});
