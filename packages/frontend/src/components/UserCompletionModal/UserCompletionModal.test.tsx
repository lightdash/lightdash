import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import UserCompletionModal from './UserCompletionModal';

describe('UserCompletionModal', () => {
    it("should not render anything if user's setup is complete", async () => {
        const { container } = renderWithProviders(<UserCompletionModal />);

        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });

    it("should render user completion modal if user's setup is not complete", async () => {
        const { getByText } = renderWithProviders(<UserCompletionModal />, {
            user: {
                isSetupComplete: false,
            },
        });

        await waitFor(() =>
            expect(getByText('Nearly there...')).toBeInTheDocument(),
        );
    });
});
