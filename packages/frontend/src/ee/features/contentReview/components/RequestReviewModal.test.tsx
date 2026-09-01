import { ContentType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../testing/testUtils';
import RequestReviewModal from './RequestReviewModal';

const createRequest = vi.fn().mockResolvedValue({});

vi.mock('../hooks/useContentReviewRequests', () => ({
    useCreateContentReviewRequest: () => ({
        mutateAsync: createRequest,
        isLoading: false,
    }),
}));

vi.mock('../../../../hooks/useSpaces', () => ({
    usePersonalSpace: () => ({
        data: { uuid: 'personal', name: 'Personal', slug: 'personal' },
    }),
    useSpaceSummaries: () => ({
        data: [
            { uuid: 'personal', name: 'Personal', parentSpaceUuid: null },
            { uuid: 'finance', name: 'Finance', parentSpaceUuid: null },
        ],
        isInitialLoading: false,
    }),
}));

vi.mock('../../../../components/common/SpaceSelector/SpaceSelector', () => ({
    default: ({
        spaces,
        onSelectSpace,
    }: {
        spaces: { uuid: string; name: string }[];
        onSelectSpace: (uuid: string) => void;
    }) => (
        <ul>
            {spaces.map((space) => (
                <li key={space.uuid}>
                    <button
                        type="button"
                        onClick={() => onSelectSpace(space.uuid)}
                    >
                        {space.name}
                    </button>
                </li>
            ))}
        </ul>
    ),
}));

const renderModal = () =>
    renderWithProviders(
        <RequestReviewModal
            projectUuid="project"
            contentType={ContentType.CHART}
            contentUuid="chart"
            contentName="Weekly revenue"
            opened
            onClose={vi.fn()}
        />,
    );

describe('RequestReviewModal', () => {
    beforeEach(() => {
        createRequest.mockClear();
    });

    it('hides the personal space and waits for a target before submitting', async () => {
        renderModal();

        expect(screen.queryByText('Personal')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Request review' }),
        ).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: 'Finance' }));
        await userEvent.type(
            screen.getByLabelText('Note for reviewers'),
            '  For the weekly review  ',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Request review' }),
        );

        await waitFor(() =>
            expect(createRequest).toHaveBeenCalledWith({
                contentType: ContentType.CHART,
                contentUuid: 'chart',
                targetSpaceUuid: 'finance',
                note: 'For the weekly review',
                similarContent: [],
            }),
        );
    });
});
