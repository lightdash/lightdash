import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { MarkResolvedModal } from './MarkResolvedModal';

const { mergeMutate, updateStatusMutate } = vi.hoisted(() => ({
    mergeMutate: vi.fn(),
    updateStatusMutate: vi.fn(),
}));

vi.mock('../../hooks/useMergePullRequest', () => ({
    useMergePullRequest: () => ({ mutate: mergeMutate, isLoading: false }),
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useUpdateAiAgentReviewItemStatus: () => ({
        mutate: updateStatusMutate,
        isLoading: false,
    }),
}));

const baseProps = {
    opened: true,
    onClose: vi.fn(),
    fingerprint: 'fp-1',
    projectUuid: 'project-1',
};

describe('MarkResolvedModal', () => {
    it('offers merge-and-resolve plus resolve-only when a PR is open', () => {
        updateStatusMutate.mockClear();
        renderWithProviders(
            <MarkResolvedModal
                {...baseProps}
                prUrl="https://github.com/acme/repo/pull/1"
            />,
        );

        expect(
            screen.getByText('Merge PR & mark resolved'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Mark resolved without merging'));
        expect(updateStatusMutate).toHaveBeenCalledWith(
            {
                fingerprint: 'fp-1',
                body: { status: 'resolved', dismissedReason: null },
            },
            expect.anything(),
        );
    });

    it('only offers resolve when there is no PR', () => {
        renderWithProviders(<MarkResolvedModal {...baseProps} prUrl={null} />);

        expect(
            screen.queryByText('Merge PR & mark resolved'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Mark resolved')).toBeInTheDocument();
    });
});
