import {
    ContentReviewContentType,
    ContentReviewRequestStatus,
    type ContentReviewRequestDetail,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../../../testing/testUtils';
import { ContentReviewRequestDetailView } from './ContentReviewRequestPage';

const approve = vi.fn().mockResolvedValue({});
const reject = vi.fn().mockResolvedValue({});
const cancel = vi.fn();

vi.mock('../hooks/useContentReviewRequests', () => ({
    useApproveContentReviewRequest: () => ({
        mutateAsync: approve,
        isLoading: false,
    }),
    useRejectContentReviewRequest: () => ({
        mutateAsync: reject,
        isLoading: false,
    }),
    useCancelContentReviewRequest: () => ({
        mutate: cancel,
        isLoading: false,
    }),
}));

const request: ContentReviewRequestDetail = {
    uuid: 'request-uuid',
    projectUuid: 'project',
    contentType: ContentReviewContentType.DASHBOARD,
    contentUuid: 'dashboard',
    sourceSpaceUuid: 'personal',
    targetSpaceUuid: 'finance',
    requestedBy: { userUuid: 'requester', firstName: 'Ada', lastName: 'L' },
    requestNote: 'Please review',
    similarContent: [],
    status: ContentReviewRequestStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    verifiedOnApprove: null,
    movedContent: [],
    grantedPrincipals: [],
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    content: { name: 'Weekly revenue', slug: 'weekly-revenue' },
    sourceSpaceName: 'Personal',
    targetSpaceName: 'Finance',
    moveSet: [
        {
            contentType: ContentReviewContentType.DASHBOARD,
            contentUuid: 'dashboard',
            name: 'Weekly revenue',
        },
        {
            contentType: ContentReviewContentType.CHART,
            contentUuid: 'c1',
            name: 'Revenue',
        },
    ],
    canReview: true,
    canVerify: true,
    verifyByDefault: true,
};

const renderView = (overrides: Partial<ContentReviewRequestDetail> = {}) =>
    renderWithProviders(
        <MemoryRouter>
            <ContentReviewRequestDetailView
                projectUuid="project"
                request={{ ...request, ...overrides }}
            />
        </MemoryRouter>,
    );

describe('ContentReviewRequestDetailView', () => {
    beforeEach(() => {
        approve.mockClear();
        reject.mockClear();
    });

    it('lists what will move and approves with the verify default', async () => {
        renderView();

        expect(screen.getByText('What will move')).toBeInTheDocument();
        expect(screen.getByText('Revenue')).toBeInTheDocument();
        expect(screen.getByLabelText('Verify on approve')).toBeChecked();

        await userEvent.click(
            screen.getByRole('button', { name: 'Approve and move' }),
        );

        await waitFor(() =>
            expect(approve).toHaveBeenCalledWith({
                requestUuid: 'request-uuid',
                body: { verify: true, note: null },
            }),
        );
    });

    it('disables verification without the permission', () => {
        renderView({ canVerify: false });

        const checkbox = screen.getByLabelText('Verify on approve');
        expect(checkbox).toBeDisabled();
        expect(checkbox).not.toBeChecked();
    });

    it('requires a note to reject', async () => {
        renderView();

        await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
        const confirmButton = () =>
            screen.getAllByRole('button', { name: 'Reject' }).at(-1)!;
        await waitFor(() => expect(confirmButton()).toBeDisabled());

        await userEvent.type(
            screen.getByLabelText('Tell the requester why'),
            'Duplicate of the finance dashboard',
        );
        await userEvent.click(confirmButton());

        await waitFor(() =>
            expect(reject).toHaveBeenCalledWith({
                requestUuid: 'request-uuid',
                body: { note: 'Duplicate of the finance dashboard' },
            }),
        );
    });

    it('hides decisions for a decided request', () => {
        renderView({
            status: ContentReviewRequestStatus.REJECTED,
            reviewedBy: { userUuid: 'admin', firstName: 'Bob', lastName: 'K' },
            reviewedAt: new Date('2026-09-01T12:00:00Z'),
            reviewNote: 'Not yet',
            canReview: true,
        });

        expect(
            screen.queryByRole('button', { name: 'Approve and move' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Rejected by Bob K/)).toBeInTheDocument();
        expect(screen.getByText('Not yet')).toBeInTheDocument();
    });
});
