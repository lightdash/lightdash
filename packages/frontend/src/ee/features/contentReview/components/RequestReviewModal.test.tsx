import { ContentReviewContentType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../testing/testUtils';
import RequestReviewModal from './RequestReviewModal';

const createRequest = vi.fn().mockResolvedValue({});
const similarContent = vi.fn().mockReturnValue({ data: [] });

vi.mock('../hooks/useSimilarContent', () => ({
    useSimilarContent: () => similarContent(),
}));

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
            {
                uuid: 'users-root',
                name: 'Default User Spaces',
                parentSpaceUuid: null,
            },
            {
                uuid: 'other-personal',
                name: 'Someone else',
                parentSpaceUuid: 'users-root',
            },
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
            contentType={ContentReviewContentType.CHART}
            contentUuid="chart"
            contentName="Weekly revenue"
            opened
            onClose={vi.fn()}
        />,
    );

const pickFinanceAndContinue = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('RequestReviewModal', () => {
    beforeEach(() => {
        createRequest.mockClear();
        similarContent.mockReturnValue({ data: [] });
    });

    it('offers only shared spaces and waits for a target before continuing', async () => {
        renderModal();

        expect(screen.queryByText('Personal')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Default User Spaces'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

        await pickFinanceAndContinue();
        await userEvent.type(
            screen.getByLabelText('Note for reviewers'),
            '  For the weekly review  ',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Request review' }),
        );

        await waitFor(() =>
            expect(createRequest).toHaveBeenCalledWith({
                contentType: ContentReviewContentType.CHART,
                contentUuid: 'chart',
                targetSpaceUuid: 'finance',
                note: 'For the weekly review',
                similarContent: [],
            }),
        );
    });

    it('goes back to the space step without losing the choice', async () => {
        renderModal();

        await pickFinanceAndContinue();
        expect(screen.getByText('Finance')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    it('requires a note when similar content exists and snapshots it', async () => {
        const match = {
            contentType: ContentReviewContentType.CHART,
            contentUuid: 'existing',
            name: 'Weekly revenue by region',
            slug: 'weekly-revenue-by-region',
            spaceUuid: 'finance',
            spaceName: 'Finance',
            isVerified: true,
            score: 150,
        };
        similarContent.mockReturnValue({ data: [match] });
        renderModal();

        await pickFinanceAndContinue();
        expect(
            screen.getByText('Something similar already exists'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Request review' }),
        ).toBeDisabled();

        await userEvent.type(
            screen.getByLabelText(/Note for reviewers/),
            'Adds a forecast',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Request review' }),
        );

        await waitFor(() =>
            expect(createRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    note: 'Adds a forecast',
                    similarContent: [match],
                }),
            ),
        );
    });
});
