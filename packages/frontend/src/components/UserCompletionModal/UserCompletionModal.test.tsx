import { screen, waitFor } from '@testing-library/react';
import { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useApp } from '../../providers/AppProvider';
import {
    renderHookWithProviders,
    renderWithProviders,
} from '../../utils/testUtils';
import UserCompletionModal from './UserCompletionModal';

vi.mock('@uiw/react-markdown-preview', () => ({
    default: ({ source }: ComponentProps<any>) => {
        return <>{source}</>;
    },
}));

describe('UserCompletionModal', () => {
    it('should render', async () => {
        const { result } = renderHookWithProviders(() => useApp(), {
            user: {
                isSetupComplete: false,
            },
        });

        await waitFor(() => expect(result.current.user.isLoading).toBe(false));

        expect(result.current.user.data!.isSetupComplete).toBe(false);
    });

    it("should not render anything if user's setup is complete", async () => {
        const { container } = renderWithProviders(<UserCompletionModal />);
        expect(container).toBeEmptyDOMElement();
    });
    // await waitFor(() => screen.findByText('Nearly there...'));
});
